#!/usr/bin/env node

/**
 * Test: Graph Island Road Network & Edge Routing via CDP - V2
 *
 * Improved version with better error diagnostics and wait mechanisms
 */

const WebSocket = require('ws');

class CDPClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messageId = 0;
    this.callbacks = new Map();
    this.eventListeners = new Map();
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

        if (msg.method && msg.params) {
          if (this.eventListeners.has(msg.method)) {
            this.eventListeners.get(msg.method).forEach(cb => cb(msg.params));
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

  on(method, callback) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(callback);
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

    // === STEP 1: Diagnostic Info ===
    console.log('\n\n=== STEP 1: Diagnostic Info ===');

    await test('Check current leaves', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const leaves = app.workspace.getActiveLeaf();
            return {
              activeLeaf: !!leaves,
              type: leaves?.view?.type,
              title: leaves?.view?.getDisplayText?.()
            };
          })()
        `
      });
      console.log(`  - Active leaf:`, result.value);
    });

    await test('List all leaves', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const allLeaves = app.workspace.iterateAllLeaves();
            const leaves = [];
            for (const leaf of allLeaves) {
              leaves.push({
                type: leaf.view?.type,
                title: leaf.view?.getDisplayText?.()
              });
            }
            return leaves;
          })()
        `
      });
      console.log(`  - All leaves:`, result.value);
    });

    // === STEP 2: Plugin Reload & Open View ===
    console.log('\n\n=== STEP 2: Plugin Reload & Open Graph View ===');

    await test('Disable plugin', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            await app.plugins.disablePlugin("graph-island");
            return "OK";
          })()
        `,
        awaitPromise: true
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
        awaitPromise: true
      });
    });

    await sleep(1000);

    await test('Open graph view command', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            app.commands.executeCommandById("graph-island:open-graph-view");
            return "OK";
          })()
        `,
        awaitPromise: false
      });
    });

    // Wait for view to fully load
    await sleep(5000);

    // Verify view exists
    await test('Verify graph view exists', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const leaves = app.workspace.getLeavesOfType("graph-view");
            return {
              count: leaves.length,
              exists: leaves.length > 0,
              first: leaves.length > 0 ? {
                type: leaves[0].view?.type,
                hasView: !!leaves[0].view
              } : null
            };
          })()
        `
      });
      console.log(`  - View check:`, result.value);
      if (!result.value.exists) {
        throw new Error('Graph view not found after open command');
      }
    });

    // === STEP 3: Get View & Check State ===
    console.log('\n\n=== STEP 3: Get View & Check Initial State ===');

    await test('Get view object', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            return {
              exists: !!v,
              type: v?.constructor?.name,
              hasPanel: !!v?.panel,
              hasPanelGroupBy: v?.panel?.groupBy !== undefined
            };
          })()
        `
      });
      console.log(`  - View state:`, result.value);
      if (!result.value.exists) {
        throw new Error('View object not accessible');
      }
    });

    // === STEP 4: Configure Grouping ===
    console.log('\n\n=== STEP 4: Configure Grouping to Folder ===');

    await test('Set groupBy folder', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.panel.groupBy = "folder";
            return "OK";
          })()
        `
      });
    });

    await test('Set clusterArrangement concentric', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.panel.clusterArrangement = "concentric";
            return "OK";
          })()
        `
      });
    });

    await test('Build panel', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.buildPanel?.();
            return "OK";
          })()
        `
      });
    });

    await test('Update forces', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.updateForces?.(true);
            return "OK";
          })()
        `
      });
    });

    console.log(`  - Waiting 15s for layout convergence...`);
    await sleep(15000);

    // === STEP 5: Road Network Data ===
    console.log('\n\n=== STEP 5: Road Network Data Validation ===');

    await test('Check road network exists', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rn = v?.roadNetworkData;
            return {
              exists: !!rn,
              system: rn?.system,
              intersectionCount: rn?.intersections?.length || 0,
              segmentCount: rn?.segments?.length || 0,
              hasIntersections: !!rn?.intersections && Array.isArray(rn.intersections),
              hasSegments: !!rn?.segments && Array.isArray(rn.segments)
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Road network exists: ${data.exists}`);
      console.log(`  - System: ${data.system}`);
      console.log(`  - Intersections: ${data.intersectionCount}`);
      console.log(`  - Segments: ${data.segmentCount}`);

      if (!data.exists) throw new Error('Road network is null/undefined');
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
              return { valid: false, reason: 'No intersections' };
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
        `
      });

      const data = result.value;
      console.log(`  - Sample intersections:`, data.samples);
      if (!data.valid) throw new Error('Invalid intersection coordinates');
    });

    // === STEP 6: Road Graphics ===
    console.log('\n\n=== STEP 6: Road Graphics Visibility ===');

    await test('Check road graphics object', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rg = v?.roadGraphics;
            return {
              exists: !!rg,
              visible: rg?.visible,
              type: rg?.constructor?.name,
              hasDrawArray: !!rg?._draw && Array.isArray(rg._draw)
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Road graphics exists: ${data.exists}`);
      console.log(`  - Visible: ${data.visible}`);
      console.log(`  - Type: ${data.type}`);
      console.log(`  - Has draw array: ${data.hasDrawArray}`);

      if (!data.exists) throw new Error('Road graphics object missing');
    });

    await test('Check draw commands', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rg = v?.roadGraphics;
            const drawCount = rg?._draw?.length || 0;

            return {
              drawCount: drawCount,
              hasDraws: drawCount > 0
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Draw commands: ${data.drawCount}`);
      if (!data.hasDraws) throw new Error('No draw commands in road graphics');
    });

    // === STEP 7: Edge Routing ===
    console.log('\n\n=== STEP 7: Edge Routing at Different Zoom Levels ===');

    const zoomLevels = [0.1, 0.5, 1.0];

    for (const zoom of zoomLevels) {
      await test(`Edge routing at zoom ${zoom}`, async () => {
        const result = await cdp.send('Runtime.evaluate', {
          expression: `
            (() => {
              const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;

              // Set zoom
              v.worldContainer.scale.set(${zoom});
              v.updateLabelsForZoom?.();

              // Find edges with graphics
              const stage = v.pixiApp?.stage;
              if (!stage) return { error: 'No stage' };

              // Recursively search for edge graphics
              const findEdges = (node, acc = []) => {
                if (node.isEdgeGraphics) {
                  acc.push(node);
                }
                if (node.children) {
                  node.children.forEach(child => findEdges(child, acc));
                }
                return acc;
              };

              const edges = findEdges(stage).slice(0, 1);

              if (edges.length === 0) {
                return {
                  zoomLevel: ${zoom},
                  edgesFound: 0,
                  routed: null,
                  roadNetworkActive: !!v.roadNetworkData
                };
              }

              const edge = edges[0];
              const waypoints = edge.waypoints || [];

              return {
                zoomLevel: ${zoom},
                edgesFound: edges.length,
                routed: waypoints.length > 0,
                waypointCount: waypoints.length,
                roadNetworkActive: !!v.roadNetworkData && v.roadNetworkData.system === 'polar'
              };
            })()
          `
        });

        const data = result.value;
        if (data.error) {
          throw new Error(data.error);
        }
        console.log(`  - Zoom ${zoom}:`, data);
      });
    }

    // === FINAL SUMMARY ===
    console.log('\n\n=== TEST SUMMARY ===');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total:  ${passCount + failCount}`);

    if (failCount > 0) {
      console.log('\nSome tests failed. See details above.');
      process.exit(1);
    } else {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    }

  } catch (err) {
    console.error('\n[FATAL]', err);
    process.exit(1);
  } finally {
    cdp.close();
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
