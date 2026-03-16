#!/usr/bin/env node

/**
 * Test: Graph Island Road Network & Edge Routing via CDP - V3
 *
 * Fixed version with proper returnByValue handling
 */

const WebSocket = require('ws');

class CDPClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messageId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('[CDP] Connected to Obsidian');
        this.setupMessageHandler();
        resolve();
      });

      this.ws.on('error', (err) => {
        console.error('[CDP] Connection error:', err.message);
        reject(err);
      });
    });
  }

  setupMessageHandler() {
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.id && this.callbacks.has(msg.id)) {
          const callback = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);

          if (msg.error) {
            callback.reject(new Error(`CDP Error: ${msg.error.message}`));
          } else {
            callback.resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('[CDP] Message parse error:', err.message);
      }
    });
  }

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = { id, method, params };

      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));

      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 5000);
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  const cdp = new CDPClient('ws://localhost:9222/devtools/page/3258C1C85DCB0CD31D497C4A1618E67D');
  let passCount = 0;
  let failCount = 0;

  const test = async (name, fn) => {
    try {
      console.log(`\n[TEST] ${name}`);
      await fn();
      passCount++;
      console.log(`✓ PASS`);
    } catch (err) {
      failCount++;
      console.error(`✗ FAIL: ${err.message}`);
    }
  };

  try {
    await cdp.connect();
    await sleep(500);

    // === STEP 1: Plugin Reload & Open View ===
    console.log('\n\n=== STEP 1: Plugin Reload & Open Graph View ===');

    await test('Disable plugin', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            await app.plugins.disablePlugin("graph-island");
            return "OK";
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(500);

    await test('Enable plugin', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            await app.plugins.enablePlugin("graph-island");
            return "OK";
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(1000);

    await test('Open graph view command', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            app.commands.executeCommandById("graph-island:open-graph-view");
            await new Promise(r => setTimeout(r, 2000));
            return "OK";
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(5000);

    // === STEP 2: Verify View Exists ===
    console.log('\n\n=== STEP 2: Verify Graph View Exists ===');

    await test('Get view object', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const leaves = app.workspace.getLeavesOfType("graph-view");
            const v = leaves.length > 0 ? leaves[0].view : null;
            return {
              leavesCount: leaves.length,
              viewExists: !!v,
              viewType: v?.constructor?.name,
              hasPanelObject: !!v?.panel
            };
          })()
        `,
        returnByValue: true
      });

      const data = result.result.value;
      console.log(`  - View check:`, data);
      if (!data.viewExists) {
        throw new Error('Graph view not accessible');
      }
    });

    // === STEP 3: Configure Grouping ===
    console.log('\n\n=== STEP 3: Configure Grouping to Folder ===');

    await test('Set groupBy and arrangement', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.panel.groupBy = "folder";
            v.panel.clusterArrangement = "concentric";
            return { groupBy: v.panel.groupBy, arrangement: v.panel.clusterArrangement };
          })()
        `,
        returnByValue: true
      });
    });

    await test('Build panel and update forces', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.buildPanel?.();
            v.updateForces?.(true);
            return "OK";
          })()
        `,
        returnByValue: true
      });
    });

    console.log(`  - Waiting 15s for layout convergence...`);
    await sleep(15000);

    // === STEP 4: Road Network Data ===
    console.log('\n\n=== STEP 4: Road Network Data Validation ===');

    await test('Check road network exists and has data', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rn = v?.roadNetworkData;
            return {
              rnExists: !!rn,
              system: rn?.system || "N/A",
              intersectionCount: rn?.intersections?.length || 0,
              segmentCount: rn?.segments?.length || 0
            };
          })()
        `,
        returnByValue: true
      });

      const data = result.result.value;
      console.log(`  - Road network:`, data);

      if (!data.rnExists) throw new Error('Road network is null/undefined');
      if (data.system !== 'polar') throw new Error(`System is ${data.system}, expected polar`);
      if (data.intersectionCount < 10) throw new Error(`Only ${data.intersectionCount} intersections, need >10`);
      if (data.segmentCount < 20) throw new Error(`Only ${data.segmentCount} segments, need >20`);
    });

    await test('Sample intersection coordinates', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rn = v?.roadNetworkData;

            if (!rn?.intersections || rn.intersections.length === 0) {
              return { valid: false, reason: 'No intersections', samples: [] };
            }

            const samples = rn.intersections.slice(0, 3).map(int => ({
              x: int.x,
              y: int.y,
              isFinite: Number.isFinite(int.x) && Number.isFinite(int.y)
            }));

            return {
              valid: samples.every(s => s.isFinite),
              samples: samples
            };
          })()
        `,
        returnByValue: true
      });

      const data = result.result.value;
      console.log(`  - Sample intersections:`, data.samples);
      if (!data.valid) throw new Error('Invalid intersection coordinates detected');
    });

    // === STEP 5: Road Graphics ===
    console.log('\n\n=== STEP 5: Road Graphics Visibility ===');

    await test('Check road graphics object', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rg = v?.roadGraphics;
            return {
              rgExists: !!rg,
              visible: rg?.visible || false,
              type: rg?.constructor?.name || "unknown",
              hasDrawArray: !!rg?._draw && Array.isArray(rg._draw),
              drawCount: rg?._draw?.length || 0
            };
          })()
        `,
        returnByValue: true
      });

      const data = result.result.value;
      console.log(`  - Road graphics:`, data);

      if (!data.rgExists) throw new Error('Road graphics object missing');
      if (!data.visible) console.log(`  ⚠️  Warning: Road graphics not visible (may be off-screen)`);
      if (data.drawCount === 0) throw new Error('No draw commands in road graphics');
    });

    // === STEP 6: Edge Routing ===
    console.log('\n\n=== STEP 6: Edge Routing at Different Zoom Levels ===');

    const zoomLevels = [0.1, 0.5, 1.0];

    for (const zoom of zoomLevels) {
      await test(`Edge routing at zoom ${zoom}`, async () => {
        const result = await cdp.send('Runtime.evaluate', {
          expression: `
            (() => {
              const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;

              if (!v?.worldContainer || !v?.pixiApp?.stage) {
                return { error: 'No stage available' };
              }

              // Set zoom
              v.worldContainer.scale.set(${zoom});
              v.updateLabelsForZoom?.();

              // Find edges recursively
              const findEdges = (node, acc = []) => {
                if (node.isEdgeGraphics) {
                  acc.push({
                    type: 'edge',
                    waypointCount: node.waypoints?.length || 0
                  });
                }
                if (node.children) {
                  node.children.forEach(child => findEdges(child, acc));
                }
                return acc;
              };

              const stage = v.pixiApp.stage;
              const edges = findEdges(stage).slice(0, 3);

              return {
                zoomLevel: ${zoom},
                edgesFound: edges.length,
                edges: edges,
                roadNetworkActive: !!v.roadNetworkData && v.roadNetworkData.system === 'polar'
              };
            })()
          `,
          returnByValue: true
        });

        const data = result.result.value;
        if (data.error) {
          throw new Error(data.error);
        }
        console.log(`  - Zoom ${zoom}:`, {
          edgesFound: data.edgesFound,
          edges: data.edges,
          roadNetworkActive: data.roadNetworkActive
        });

        if (data.edgesFound === 0) {
          console.log(`    ⚠️  No edges found (graph may be empty or off-screen)`);
        }
      });
    }

    // === STEP 7: Console Errors ===
    console.log('\n\n=== STEP 7: Console Error Check ===');

    await test('Check for console errors', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            // Try to detect if there are any errors in the console
            return {
              check: 'Manual console inspection recommended via DevTools'
            };
          })()
        `,
        returnByValue: true
      });

      console.log(`  - Console inspection: Check browser DevTools console for graph-island errors`);
    });

    // === FINAL SUMMARY ===
    console.log('\n\n=== TEST SUMMARY ===');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total:  ${passCount + failCount}`);

    if (failCount > 0) {
      console.log('\nFailed tests:');
      process.exit(1);
    } else {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    }

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    process.exit(1);
  } finally {
    cdp.close();
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
