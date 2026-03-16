#!/usr/bin/env node

/**
 * Test: Graph Island Road Network & Edge Routing - Direct Obsidian API
 *
 * Tests road network generation by directly calling window.globalTestAPI
 * which is exposed by Graph Island for testing purposes
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
        console.log('[CDP] Connected');
        this.setupMessageHandler();
        resolve();
      });
      this.ws.on('error', reject);
    });
  }

  setupMessageHandler() {
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) {
            reject(new Error('CDP: ' + msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        console.error('[CDP] Parse error:', e.message);
      }
    });
  }

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const msg = { id, method, params };
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error('Timeout'));
        }
      }, 8000);
    });
  }

  close() {
    this.ws && this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  const cdp = new CDPClient('ws://localhost:9222/devtools/page/3258C1C85DCB0CD31D497C4A1618E67D');
  let pass = 0, fail = 0;

  const test = async (name, fn) => {
    try {
      console.log('\n[TEST] ' + name);
      await fn();
      pass++;
      console.log('✓ PASS');
    } catch (e) {
      fail++;
      console.error('✗ FAIL: ' + e.message);
    }
  };

  try {
    await cdp.connect();
    await sleep(300);

    console.log('\n\n=== STEP 1: Plugin Reload ===');

    await test('Disable', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(async () => { await app.plugins.disablePlugin("graph-island"); return true; })()',
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(500);

    await test('Enable', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(async () => { await app.plugins.enablePlugin("graph-island"); return true; })()',
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(1000);

    await test('Open view', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(async () => { app.commands.executeCommandById("graph-island:open-graph-view"); await new Promise(r => setTimeout(r, 2000)); return true; })()',
        awaitPromise: true,
        returnByValue: true
      });
    });

    await sleep(3000);

    console.log('\n\n=== STEP 2: Configure Layout ===');

    await test('Set groupBy folder', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(() => { let v = app.workspace.getLeavesOfType("graph-view")[0]?.view; if (!v) throw new Error("View not found"); let d = Object.getOwnPropertyDescriptors(v); let p = d.panel?.value || d.panel?.get?.call(v); if (!p) { console.error("Panel keys:", Object.keys(d)); throw new Error("Panel descriptor found but value is " + typeof p); } p.groupBy = "folder"; return true; })()',
        returnByValue: true
      });
    });

    await test('Set arrangement', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(() => { let v = app.workspace.getLeavesOfType("graph-view")[0]?.view; let d = Object.getOwnPropertyDescriptors(v); let p = d.panel?.value; if (!p) throw new Error("Panel still not found"); p.clusterArrangement = "concentric"; return true; })()',
        returnByValue: true
      });
    });

    await test('Rebuild', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(() => { let v = app.workspace.getLeavesOfType("graph-view")[0]?.view; v.buildPanel?.(); v.updateForces?.(true); return true; })()',
        returnByValue: true
      });
    });

    console.log('  - Waiting 15s for convergence');
    await sleep(15000);

    console.log('\n\n=== STEP 3: Inspect Road Network ===');

    await test('Inspect roadNetworkData property', async () => {
      // Use console output for debugging
      await cdp.send('Runtime.evaluate', {
        expression: '(() => { let v = app.workspace.getLeavesOfType("graph-view")[0]?.view; console.log("View keys:", Object.keys(v).slice(0, 10)); let d = Object.getOwnPropertyDescriptors(v); console.log("Descriptor keys:", Object.keys(d).slice(0, 20)); let rn = d.roadNetworkData?.value; console.log("roadNetworkData:", !!rn, rn?.system, rn?.intersections?.length, rn?.segments?.length); return "OK"; })()',
        returnByValue: true
      });
    });

    await sleep(2000);

    console.log('\n\n=== STEP 4: Direct Data Access ===');

    // Try alternative property names
    await test('Access via alternative patterns', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            let v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            // Log all non-function properties
            for (let key of Object.keys(v)) {
              let val = v[key];
              if (typeof val !== 'function' && typeof val !== 'object') {
                console.log(key + ":", typeof val);
              }
            }
            // Check prototype methods
            let proto = Object.getPrototypeOf(v);
            console.log("Has doRender:", typeof proto.doRender);
            console.log("Has markDirty:", typeof proto.markDirty);
            return "OK";
          })()
        `,
        returnByValue: true
      });
    });

    await sleep(2000);

    console.log('\n\n=== STEP 5: Call Render Methods ===');

    await test('Call doRender()', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: '(() => { let v = app.workspace.getLeavesOfType("graph-view")[0]?.view; v.doRender?.(); console.log("doRender called"); return true; })()',
        returnByValue: true
      });
    });

    await sleep(3000);

    console.log('\n\n=== STEP 6: Verify Road Graphics Canvas ===');

    await test('Check canvas elements', async () => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            let v = app.workspace.getLeavesOfType("graph-view")[0]?.view;
            let containerEl = v?.containerEl;
            let canvas = containerEl?.querySelector("canvas");
            console.log("Container element:", !!containerEl);
            console.log("Canvas found:", !!canvas);
            if (canvas) {
              console.log("Canvas size:", canvas.width, "x", canvas.height);
            }
            // Check for SVG
            let svg = containerEl?.querySelector("svg");
            console.log("SVG found:", !!svg);
            return true;
          })()
        `,
        returnByValue: true
      });
    });

    await sleep(1000);

    console.log('\n\n=== TEST SUMMARY ===');
    console.log('Passed: ' + pass);
    console.log('Failed: ' + fail);
    console.log('Total:  ' + (pass + fail));

    console.log('\n\n=== DIAGNOSTIC NOTES ===');
    console.log('Check the Obsidian console (DevTools) for detailed output:');
    console.log('  - console.log messages show property inspection results');
    console.log('  - Look for "roadNetworkData" details in the logs');
    console.log('  - Canvas and SVG rendering status is reported');

    if (fail === 0) {
      console.log('\n✓ All tests executed (check console for data details)');
      process.exit(0);
    } else {
      process.exit(1);
    }

  } catch (e) {
    console.error('\n[FATAL]', e.message);
    process.exit(1);
  } finally {
    cdp.close();
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
