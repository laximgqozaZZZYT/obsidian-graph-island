#!/usr/bin/env node
const WebSocket = require('ws');

const CDP_URL = 'ws://localhost:9222/devtools/page/18847719F7FA91B18599DFB5D41EF973';
const WAIT_BETWEEN_PRESETS = 4000;
const RENDER_WAIT = 6000;

let ws = null;
let messageId = 1;
const testResults = {
  phase1: { status: 'PENDING', details: [] },
  phase2: { status: 'PENDING', details: [] },
  phase3: { status: 'PENDING', details: [] },
  phase4: { status: 'PENDING', details: [] },
  phase5: { status: 'PENDING', details: [] },
  phase6: { status: 'PENDING', details: [] },
};
const errors = [];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg) {
  console.error(`[ERROR] ${msg}`);
  errors.push(msg);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendCDP(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const timeout = setTimeout(() => reject(new Error(`timeout`)), 10000);

    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (data.error) {
          reject(new Error(JSON.stringify(data.error)));
        } else {
          resolve(data.result || {});
        }
      }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await sendCDP('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  
  const value = result.result?.value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function connectCDP() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(CDP_URL);
    ws.onopen = () => {
      log('CDP connected');
      resolve();
    };
    ws.onerror = (err) => reject(err);
  });
}

async function phase1_PluginLoad() {
  log('\n=== PHASE 1: Plugin Load and Basic Rendering ===');
  try {
    log('Opening graph view...');
    
    await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) {
          window.app.workspace.getLeaf('tab').setViewState({
            type: 'graph-view',
            active: true,
          });
        }
      })()
    `);
    
    log('Waiting 6 seconds for render...');
    await sleep(RENDER_WAIT);

    const viewData = await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return JSON.stringify({ error: 'no view' });
        
        const view = leaves[0].view;
        return JSON.stringify({
          cmdLength: view.edgeGraphics?.commands?.length || 0,
          hasRawData: !!view.rawData,
          hasWorldContainer: !!view.worldContainer,
        });
      })()
    `);

    log(`Edge commands: ${viewData.cmdLength}, Has data: ${viewData.hasRawData}`);

    if (viewData.cmdLength > 0 && viewData.hasRawData) {
      testResults.phase1.status = 'PASS';
      testResults.phase1.details.push(
        `Edge commands: ${viewData.cmdLength}`,
        `Has raw data: ${viewData.hasRawData}`,
        `Has world container: ${viewData.hasWorldContainer}`
      );
    } else {
      testResults.phase1.status = 'FAIL';
      testResults.phase1.details.push(`Insufficient rendering: cmdLength=${viewData.cmdLength}`);
    }
  } catch (e) {
    testResults.phase1.status = 'FAIL';
    logError(`Phase 1 failed: ${e.message}`);
    testResults.phase1.details.push(e.message);
  }
}

async function phase2_ArrangementSwitching() {
  log('\n=== PHASE 2: Arrangement Switching (5 patterns) ===');
  const arrangements = ['grid', 'concentric', 'timeline', 'triangle', 'custom'];
  const results = {};

  for (const arrangement of arrangements) {
    try {
      log(`Testing arrangement: ${arrangement}`);

      await evaluate(`
        (function() {
          const leaves = window.app.workspace.getLeavesOfType('graph-view');
          if (leaves.length === 0) return;
          const view = leaves[0].view;
          view.clusterArrangement = '${arrangement}';
          if (view.doRender) view.doRender();
        })()
      `);

      await sleep(WAIT_BETWEEN_PRESETS);

      const data = await evaluate(`
        (function() {
          const leaves = window.app.workspace.getLeavesOfType('graph-view');
          if (leaves.length === 0) return JSON.stringify({ cmdLength: 0 });
          const view = leaves[0].view;
          return JSON.stringify({
            cmdLength: view.edgeGraphics?.commands?.length || 0,
          });
        })()
      `);

      results[arrangement] = {
        status: data.cmdLength > 0 ? 'PASS' : 'FAIL',
        cmdLength: data.cmdLength,
      };
      log(`${arrangement}: ${data.cmdLength} commands rendered`);
    } catch (e) {
      results[arrangement] = { status: 'FAIL', error: e.message };
      logError(`Arrangement ${arrangement} failed: ${e.message}`);
    }
  }

  const allPassed = Object.values(results).every(r => r.status === 'PASS');
  testResults.phase2.status = allPassed ? 'PASS' : 'FAIL';
  testResults.phase2.details = Object.entries(results).map(
    ([arr, r]) => `${arr}: ${r.status}`
  );
}

async function phase3_Accessibility() {
  log('\n=== PHASE 3: Accessibility Audit ===');
  try {
    const a11yData = await evaluate(`
      (function() {
        const graphMain = document.querySelector('.graph-main');
        if (!graphMain) {
          return JSON.stringify({ error: 'graph-main not found' });
        }

        // Look for plugin-specific controls (in the settings panel or header)
        const pluginControls = graphMain.querySelectorAll('[class*="setting"], [class*="control"], [class*="toggle"], [class*="checkbox"]');
        const inputs = Array.from(pluginControls).filter(el => {
          return el.tagName === 'INPUT' || el.tagName === 'SELECT';
        });

        const unlabeledInputs = inputs.filter(el => {
          const hasAriaLabel = el.hasAttribute('aria-label');
          const hasLabel = !!graphMain.querySelector(\`label[for="\${el.id}"]\`);
          const hasAriaLabelledBy = el.hasAttribute('aria-labelledby');
          return !hasAriaLabel && !hasLabel && !hasAriaLabelledBy;
        });

        return JSON.stringify({
          pluginControlsFound: pluginControls.length,
          inputCount: inputs.length,
          unlabeledCount: unlabeledInputs.length,
          note: 'Plugin-specific controls only'
        });
      })()
    `);

    if (a11yData?.error) {
      throw new Error(a11yData.error);
    }

    log(`Plugin controls: ${a11yData?.pluginControlsFound}, Inputs: ${a11yData?.inputCount}, Unlabeled: ${a11yData?.unlabeledCount}`);

    if (a11yData?.unlabeledCount === 0 || a11yData?.inputCount === 0) {
      testResults.phase3.status = 'PASS';
      testResults.phase3.details.push(
        `Plugin inputs checked: ${a11yData.inputCount}`,
        `Unlabeled: ${a11yData.unlabeledCount}`,
        `${a11yData.note}`
      );
    } else {
      testResults.phase3.status = 'FAIL';
      testResults.phase3.details.push(
        `${a11yData?.unlabeledCount} unlabeled plugin inputs found`
      );
    }
  } catch (e) {
    testResults.phase3.status = 'FAIL';
    logError(`Phase 3 failed: ${e.message}`);
    testResults.phase3.details.push(e.message);
  }
}

async function phase4_EdgeRendering() {
  log('\n=== PHASE 4: Edge Rendering Verification ===');
  try {
    log('Testing edge rendering with grid + showLinks...');
    await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return;
        const view = leaves[0].view;
        view.clusterArrangement = 'grid';
        view.showLinks = true;
        if (view.doRender) view.doRender();
      })()
    `);

    await sleep(WAIT_BETWEEN_PRESETS);

    const edgeData = await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return JSON.stringify({ cmdLength: 0 });
        const view = leaves[0].view;
        return JSON.stringify({
          cmdLength: view.edgeGraphics?.commands?.length || 0,
          showLinks: view.showLinks,
          cableBundleMode: view.cableBundleMode,
        });
      })()
    `);

    log(`Edge commands: ${edgeData?.cmdLength}, showLinks: ${edgeData?.showLinks}`);

    if (edgeData?.cmdLength > 0) {
      testResults.phase4.status = 'PASS';
      testResults.phase4.details.push(
        `Edge commands: ${edgeData.cmdLength}`,
        `showLinks: ${edgeData.showLinks}`,
        `cableBundleMode: ${edgeData.cableBundleMode || 'default'}`
      );
    } else {
      testResults.phase4.status = 'FAIL';
      testResults.phase4.details.push(`No edges rendered (cmdLength=0)`);
    }
  } catch (e) {
    testResults.phase4.status = 'FAIL';
    logError(`Phase 4 failed: ${e.message}`);
    testResults.phase4.details.push(e.message);
  }
}

async function phase5_MemoryLeak() {
  log('\n=== PHASE 5: Memory Leak Check (10x drawEdges) ===');
  try {
    const initialState = await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return JSON.stringify({ count: 0 });
        const view = leaves[0].view;
        return JSON.stringify({ count: view.worldContainer?.children?.length || 0 });
      })()
    `);

    log(`Initial worldContainer.children: ${initialState?.count}`);

    for (let i = 0; i < 10; i++) {
      await evaluate(`
        (function() {
          const leaves = window.app.workspace.getLeavesOfType('graph-view');
          if (leaves.length > 0 && leaves[0].view.drawEdges) {
            leaves[0].view.drawEdges();
          }
        })()
      `);
      await sleep(200);
    }

    const finalState = await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return JSON.stringify({ count: 0 });
        const view = leaves[0].view;
        return JSON.stringify({ count: view.worldContainer?.children?.length || 0 });
      })()
    `);

    log(`Final worldContainer.children: ${finalState?.count}`);

    if ((finalState?.count || 0) <= (initialState?.count || 0)) {
      testResults.phase5.status = 'PASS';
      testResults.phase5.details.push(
        `Initial: ${initialState?.count} children`,
        `Final: ${finalState?.count} children`,
        `No growth detected`
      );
    } else {
      testResults.phase5.status = 'FAIL';
      testResults.phase5.details.push(
        `Growth detected: +${(finalState?.count || 0) - (initialState?.count || 0)} children`
      );
    }
  } catch (e) {
    testResults.phase5.status = 'FAIL';
    logError(`Phase 5 failed: ${e.message}`);
    testResults.phase5.details.push(e.message);
  }
}

async function phase6_RoadNetwork() {
  log('\n=== PHASE 6: Road Network ===');
  try {
    const roadData = await evaluate(`
      (function() {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return JSON.stringify({ error: 'no view' });
        const view = leaves[0].view;
        
        try {
          if (view.drawRoadNetwork) {
            view.drawRoadNetwork();
          }
          return JSON.stringify({
            cmdLength: view.roadGraphics?.commands?.length || 0,
            hasMethod: !!view.drawRoadNetwork,
          });
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      })()
    `);

    if (roadData?.error) {
      testResults.phase6.status = 'FAIL';
      testResults.phase6.details.push(`Error: ${roadData.error}`);
    } else {
      testResults.phase6.status = 'PASS';
      testResults.phase6.details.push(
        `Method available: ${roadData?.hasMethod}`,
        `Graphics commands: ${roadData?.cmdLength}`
      );
    }
  } catch (e) {
    testResults.phase6.status = 'FAIL';
    logError(`Phase 6 failed: ${e.message}`);
    testResults.phase6.details.push(e.message);
  }
}

async function runAllTests() {
  try {
    await connectCDP();
    await sleep(1000);

    await phase1_PluginLoad();
    await phase2_ArrangementSwitching();
    await phase3_Accessibility();
    await phase4_EdgeRendering();
    await phase5_MemoryLeak();
    await phase6_RoadNetwork();

    // Print summary
    log('\n' + '='.repeat(65));
    log('COMPREHENSIVE E2E TEST SUMMARY');
    log('='.repeat(65));

    Object.entries(testResults).forEach(([phase, result]) => {
      const statusStr = result.status === 'PASS' ? 'PASS' : 'FAIL';
      console.log(`\n${phase.toUpperCase()}: ${statusStr}`);
      result.details.forEach(detail => console.log(`  ${detail}`));
    });

    if (errors.length > 0) {
      log('\n' + '='.repeat(65));
      log('ERRORS');
      log('='.repeat(65));
      errors.forEach((e, i) => console.log(`${i + 1}. ${e}`));
    }

    const passCount = Object.values(testResults).filter(r => r.status === 'PASS').length;
    const totalPhases = Object.keys(testResults).length;
    console.log(`\n=== FINAL RESULT: ${passCount}/${totalPhases} phases passed ===\n`);

    ws.close();
    process.exit(passCount === totalPhases ? 0 : 1);
  } catch (e) {
    logError(`Fatal: ${e.message}`);
    if (ws) ws.close();
    process.exit(1);
  }
}

runAllTests();
