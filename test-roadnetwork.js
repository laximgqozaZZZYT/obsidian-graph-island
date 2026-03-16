#!/usr/bin/env node

/**
 * Test: Graph Island Road Network & Edge Routing via CDP
 *
 * Tests road network generation, intersection data, and edge routing
 * through Canvas Graphics on the polar coordinate system.
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

        // Handle responses
        if (msg.id && this.callbacks.has(msg.id)) {
          const callback = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);

          if (msg.error) {
            callback.reject(new Error(`CDP Error: ${msg.error.message}`));
          } else {
            callback.resolve(msg.result);
          }
        }

        // Handle events
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

      // 5s timeout
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

/**
 * Main test suite
 */
async function runTests() {
  const cdp = new CDPClient('ws://localhost:9222/devtools/page/3258C1C85DCB0CD31D497C4A1618E67D');
  let passCount = 0;
  let failCount = 0;
  const results = [];

  const test = async (name, fn) => {
    try {
      console.log(`\n[TEST] ${name}`);
      await fn();
      passCount++;
      results.push({ name, status: 'PASS' });
      console.log(`✓ PASS`);
    } catch (err) {
      failCount++;
      results.push({ name, status: 'FAIL', error: err.message });
      console.error(`✗ FAIL: ${err.message}`);
    }
  };

  try {
    await cdp.connect();
    await new Promise(r => setTimeout(r, 500));

    // === STEP 1: Plugin Reload & Graph View ===
    console.log('\n\n=== STEP 1: Plugin Reload & Graph View Open ===');

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

    await new Promise(r => setTimeout(r, 500));

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

    await new Promise(r => setTimeout(r, 1000));

    await test('Open graph view', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            app.commands.executeCommandById("graph-island:open-graph-view");
            await new Promise(r => setTimeout(r, 1000));
            return "OK";
          })()
        `,
        awaitPromise: true
      });
    });

    await new Promise(r => setTimeout(r, 5000));

    // === STEP 2: Grouping Setup ===
    console.log('\n\n=== STEP 2: Grouping Setup ===');

    await test('Get view reference', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            return !!v ? "View exists" : "View not found";
          })()
        `
      });
      if (result.value !== 'View exists') {
        throw new Error('Graph view not found');
      }
    });

    await test('Configure grouping to folder', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            v.panel.groupBy = "folder";
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
            v.buildPanel();
            v.updateForces(true);
            return "OK";
          })()
        `
      });
    });

    await new Promise(r => setTimeout(r, 15000)); // Layout convergence

    // === STEP 3: Road Network Data Validation ===
    console.log('\n\n=== STEP 3: Road Network Data Validation ===');

    await test('Road network exists', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rn = v.roadNetworkData;
            return {
              exists: !!rn,
              system: rn?.system,
              intersectionCount: rn?.intersections?.length || 0,
              segmentCount: rn?.segments?.length || 0
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Road network: ${data.exists ? 'EXISTS' : 'MISSING'}`);
      console.log(`  - System: ${data.system}`);
      console.log(`  - Intersections: ${data.intersectionCount}`);
      console.log(`  - Segments: ${data.segmentCount}`);

      if (!data.exists) throw new Error('Road network is null');
      if (data.system !== 'polar') throw new Error(`System is ${data.system}, expected polar`);
      if (data.intersectionCount < 10) throw new Error(`Only ${data.intersectionCount} intersections, expected >10`);
      if (data.segmentCount < 20) throw new Error(`Only ${data.segmentCount} segments, expected >20`);
    });

    await test('Intersection coordinates valid', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rn = v.roadNetworkData;

            if (!rn || !rn.intersections || rn.intersections.length === 0) {
              return { valid: false, reason: "No intersections" };
            }

            // Sample first 3 intersections
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

    // === STEP 4: Road Graphics Visibility ===
    console.log('\n\n=== STEP 4: Road Graphics Visibility ===');

    await test('Road graphics object exists', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rg = v.roadGraphics;
            return {
              exists: !!rg,
              visible: rg?.visible,
              type: rg?.constructor?.name
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Road graphics exists: ${data.exists}`);
      console.log(`  - Visible: ${data.visible}`);
      console.log(`  - Type: ${data.type}`);

      if (!data.exists) throw new Error('Road graphics object missing');
      if (!data.visible) throw new Error('Road graphics not visible');
    });

    await test('Road graphics has draws', async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            const rg = v.roadGraphics;

            // CanvasGraphics stores draw commands in _draw array
            const hasDraws = rg && rg._draw && Array.isArray(rg._draw) && rg._draw.length > 0;
            return {
              hasDraws: hasDraws,
              drawCount: rg?._draw?.length || 0
            };
          })()
        `
      });

      const data = result.value;
      console.log(`  - Draw commands: ${data.drawCount}`);
      if (!data.hasDraws) throw new Error('No draw commands recorded');
    });

    // === STEP 5: Edge Routing at Different Zoom Levels ===
    console.log('\n\n=== STEP 5: Edge Routing Verification (Multiple Zoom Levels) ===');

    const zoomLevels = [0.1, 0.5, 1.0];

    for (const zoom of zoomLevels) {
      await test(`Edge routing at zoom ${zoom}`, async () => {
        const result = await cdp.send('Runtime.evaluate', {
          expression: `
            (() => {
              const v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
              const rn = v.roadNetworkData;

              // Set zoom
              v.worldContainer.scale.set(${zoom});
              v.updateLabelsForZoom();

              // Sample first edge with routing
              const edges = v.pixiApp.stage.children
                .filter(c => c.isEdgeGraphics)
                .slice(0, 1);

              if (edges.length === 0) {
                return {
                  zoomLevel: ${zoom},
                  edgesFound: 0,
                  routed: null
                };
              }

              const edge = edges[0];
              const hasWaypoints = edge.waypoints && edge.waypoints.length > 0;
              const isStraightLine = !hasWaypoints || edge.waypoints.length === 0;

              return {
                zoomLevel: ${zoom},
                edgesFound: edges.length,
                routed: !isStraightLine,
                waypointCount: edge.waypoints?.length || 0,
                roadNetworkActive: !!rn && rn.system === 'polar'
              };
            })()
          `
        });

        const data = result.value;
        console.log(`  - Zoom ${zoom}: ${data.edgesFound} edges found`);
        if (data.edgesFound > 0) {
          console.log(`    - Routed: ${data.routed}`);
          console.log(`    - Waypoints: ${data.waypointCount}`);
          console.log(`    - Road network active: ${data.roadNetworkActive}`);
        }
      });
    }

    // === STEP 6: Console Error Monitoring ===
    console.log('\n\n=== STEP 6: Console Error Monitoring ===');

    let runtimeErrors = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      if (params.exceptionDetails.text.includes('graph-island')) {
        runtimeErrors.push({
          message: params.exceptionDetails.text,
          url: params.exceptionDetails.url,
          lineNumber: params.exceptionDetails.lineNumber
        });
      }
    });

    await test('Monitor console for errors', async () => {
      // Give time to collect any errors
      await new Promise(r => setTimeout(r, 2000));

      if (runtimeErrors.length > 0) {
        console.log(`  - ${runtimeErrors.length} graph-island related errors found:`);
        runtimeErrors.forEach((err, i) => {
          console.log(`    ${i + 1}. ${err.message}`);
          console.log(`       URL: ${err.url}:${err.lineNumber}`);
        });
        throw new Error(`Found ${runtimeErrors.length} console errors`);
      } else {
        console.log(`  - No graph-island related console errors`);
      }
    });

    // === FINAL SUMMARY ===
    console.log('\n\n=== TEST SUMMARY ===');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total:  ${passCount + failCount}`);

    if (failCount > 0) {
      console.log('\nFailed tests:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
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

// Run
runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
