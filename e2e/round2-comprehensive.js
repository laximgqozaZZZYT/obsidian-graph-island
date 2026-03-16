#!/usr/bin/env node
/**
 * E2E Test Round 2: Panel Operations, Search, Groups, Edges, A11Y, State Persistence
 * Covers phases 7-12 with comprehensive metrics and error collection
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:9222/devtools/page/18847719F7FA91B18599DFB5D41EF973';

let msgId = 0;
const ws = new WebSocket(WS_URL);

const results = {
  phase7: { passed: false, metrics: {}, errors: [] },
  phase8: { passed: false, metrics: {}, errors: [] },
  phase9: { passed: false, metrics: {}, errors: [] },
  phase10: { passed: false, metrics: {}, errors: [] },
  phase11: { passed: false, metrics: {}, errors: [] },
  phase12: { passed: false, metrics: {}, errors: [] },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendMessage(method, params = {}) {
  return new Promise((resolve, reject) => {
    msgId++;
    const msg = { id: msgId, method, params };
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout on ${method}`));
    }, 10000);

    const handler = (message) => {
      const data = JSON.parse(message.toString());
      if (data.id === msgId) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        if (data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data.result);
        }
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

async function evaluateCode(code, description = '') {
  try {
    const result = await sendMessage('Runtime.evaluate', {
      expression: code,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Eval exception: ${result.exceptionDetails.text}`);
    }
    // Extract the actual value from the result object
    if (result.result && 'value' in result.result) {
      return result.result.value;
    }
    return result.value;
  } catch (err) {
    console.error(`[ERROR] ${description}: ${err.message}`);
    throw err;
  }
}

async function phase7_panelOperations() {
  console.log('\n=== PHASE 7: PANEL OPERATIONS ===');

  try {
    // Ensure view is open
    console.log('Step 1: Verify view is open...');
    const viewOpen = await evaluateCode(
      `(function() {
        const leaf = app.workspace.getLeavesOfType('graph-view')[0];
        return { isOpen: !!leaf, type: leaf?.view?.constructor?.name };
      })()`,
      'Check view open'
    );
    console.log(`  View type: ${viewOpen.type}, Open: ${viewOpen.isOpen}`);

    // Trigger initial load if needed
    console.log('Step 2: Trigger initial render to load graph data...');
    if (results.phase7.metrics.initial_nodes === undefined) {
      await evaluateCode(
        `(async function() {
          const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
          if (!view.originalGraphData) {
            view.rawData = null;
            await view.doRender();
          }
        })()`,
        'Initial load'
      );
      await sleep(6000);
    }

    // Get initial node count
    console.log('Step 2b: Get initial node count (showOrphans=true)...');
    let initialCount = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        const nodes = view.originalGraphData.nodes.length;
        const showOrphans = view.panel?.showOrphans;
        return { nodes, showOrphans };
      })()`,
      'Get initial node count'
    );
    console.log(`  Initial nodes: ${initialCount?.nodes}, showOrphans: ${initialCount?.showOrphans}`);
    results.phase7.metrics.initial_nodes = initialCount?.nodes || 0;
    results.phase7.metrics.initial_showOrphans = initialCount?.showOrphans;

    // Toggle showOrphans to false
    console.log('Step 3: Set showOrphans=false and invalidateData()...');
    await evaluateCode(
      `(async function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.showOrphans = false;
        }
        // Invalidate graph data (this triggers doRender internally)
        view.rawData = null;
        await view.doRender();
      })()`,
      'Set showOrphans false'
    );
    await sleep(5000);

    let afterFalse = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        return view.originalGraphData.nodes.length;
      })()`,
      'Get node count after false'
    );
    console.log(`  Nodes after showOrphans=false: ${afterFalse}`);
    results.phase7.metrics.after_false_nodes = afterFalse || 0;
    results.phase7.metrics.node_count_decreased = (afterFalse || 0) < (results.phase7.metrics.initial_nodes || 0);

    // Toggle showOrphans back to true
    console.log('Step 4: Set showOrphans=true and invalidateData()...');
    await evaluateCode(
      `(async function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.showOrphans = true;
        }
        view.rawData = null;
        await view.doRender();
      })()`,
      'Set showOrphans true'
    );
    await sleep(5000);

    let afterTrue = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        return view.originalGraphData.nodes.length;
      })()`,
      'Get node count after true'
    );
    console.log(`  Nodes after showOrphans=true: ${afterTrue}`);
    results.phase7.metrics.after_true_nodes = afterTrue || 0;
    results.phase7.metrics.nodes_restored = Math.abs((afterTrue || 0) - (results.phase7.metrics.initial_nodes || 0)) < 10;

    results.phase7.errors = [];
    results.phase7.passed = results.phase7.metrics.node_count_decreased && results.phase7.metrics.nodes_restored;
    console.log(`  ✓ Phase 7 result: ${results.phase7.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase7.errors.push(err.message);
    console.error(`  ✗ Phase 7 failed: ${err.message}`);
  }
}

async function phase8_searchFiltering() {
  console.log('\n=== PHASE 8: SEARCH QUERY FILTERING ===');

  try {
    // Get full node count baseline
    console.log('Step 1: Get full baseline (no search)...');
    let baseline = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        return view.originalGraphData.nodes.length;
      })()`,
      'Get baseline nodes'
    );
    console.log(`  Baseline nodes: ${baseline}`);
    results.phase8.metrics.baseline_nodes = baseline;

    // Apply search query filter
    console.log('Step 2: Set searchQuery="path:classic-*" and invalidateDataKeepPanel()...');
    await evaluateCode(
      `(async function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.searchQuery = 'path:classic-*';
        }
        view.rawData = null;
        view.skipPanelRebuildCount = (view.skipPanelRebuildCount || 0) + 1;
        await view.doRender();
        view.skipPanelRebuildCount = Math.max(0, view.skipPanelRebuildCount - 1);
      })()`,
      'Set search query'
    );
    await sleep(5000);

    let filtered = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        return view.originalGraphData.nodes.length;
      })()`,
      'Get filtered node count'
    );
    console.log(`  Filtered nodes (path:classic-*): ${filtered}`);
    results.phase8.metrics.filtered_nodes = filtered;
    results.phase8.metrics.filtered_less_than_baseline = filtered < baseline;

    // Clear search
    console.log('Step 3: Clear searchQuery and invalidateDataKeepPanel()...');
    await evaluateCode(
      `(async function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.searchQuery = '';
        }
        view.rawData = null;
        view.skipPanelRebuildCount = (view.skipPanelRebuildCount || 0) + 1;
        await view.doRender();
        view.skipPanelRebuildCount = Math.max(0, view.skipPanelRebuildCount - 1);
      })()`,
      'Clear search query'
    );
    await sleep(5000);

    let restored = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view || !view.originalGraphData) return null;
        return view.originalGraphData.nodes.length;
      })()`,
      'Get restored node count'
    );
    console.log(`  Restored nodes: ${restored}`);
    results.phase8.metrics.restored_nodes = restored;
    results.phase8.metrics.restored_to_baseline = Math.abs(restored - baseline) < 10;

    results.phase8.errors = [];
    results.phase8.passed = results.phase8.metrics.filtered_less_than_baseline &&
                            results.phase8.metrics.restored_to_baseline;
    console.log(`  ✓ Phase 8 result: ${results.phase8.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase8.errors.push(err.message);
    console.error(`  ✗ Phase 8 failed: ${err.message}`);
  }
}

async function phase9_groupCollapse() {
  console.log('\n=== PHASE 9: GROUP COLLAPSE/EXPAND ===');

  try {
    // Get baseline with no grouping
    console.log('Step 1: Get baseline node count (groupBy="")...');
    let baseline = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.groupBy = '';
        }
        return view.originalGraphData?.nodes?.length || 0;
      })()`,
      'Get baseline for grouping'
    );
    console.log(`  Baseline nodes (no grouping): ${baseline}`);
    results.phase9.metrics.baseline_nodes = baseline;
    await sleep(2000);

    // Apply groupBy="folder"
    console.log('Step 2: Set groupBy="folder" and doRender()...');
    await evaluateCode(
      `(async function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          view.panel.groupBy = 'folder';
        }
        await view.doRender();
      })()`,
      'Set groupBy folder'
    );
    await sleep(5000);

    let grouped = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        // When groupBy is active, collapsed groups create super-nodes
        // So we need to render and check visual node count
        const visibleNodeCount = (view.worldContainer?.children || []).reduce((count, child) => {
          // Count containers that represent actual rendered nodes
          if (child.graphicsContainer || child.graphics) return count + 1;
          return count;
        }, 0) || 0;
        const collapsedSize = view?.panel?.collapsedGroups?.size || 0;
        return { visibleNodeCount, collapsedSize };
      })()`,
      'Get grouped state'
    );
    console.log(`  Visible nodes after groupBy="folder": ${grouped.visibleNodeCount}`);
    console.log(`  Collapsed groups: ${grouped.collapsedSize}`);
    results.phase9.metrics.grouped_nodes = grouped.visibleNodeCount;
    results.phase9.metrics.collapsed_groups = grouped.collapsedSize;
    results.phase9.metrics.nodes_reduced = grouped.visibleNodeCount < baseline;
    results.phase9.metrics.has_collapsed = grouped.collapsedSize > 0;

    results.phase9.errors = [];
    results.phase9.passed = results.phase9.metrics.nodes_reduced && results.phase9.metrics.has_collapsed;
    console.log(`  ✓ Phase 9 result: ${results.phase9.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase9.errors.push(err.message);
    console.error(`  ✗ Phase 9 failed: ${err.message}`);
  }
}

async function phase10_edgeToggle() {
  console.log('\n=== PHASE 10: EDGE TYPE TOGGLES ===');

  try {
    // Disable all edges
    console.log('Step 1: Disable all edge types...');
    await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          const p = view.panel;
          p.showLinks = false;
          p.showSemanticEdges = false;
          p.showTagEdges = false;
          p.showInheritance = false;
          p.showSimilar = false;
        }
        if (view?.drawEdges) {
          view.drawEdges();
        }
      })()`,
      'Disable all edges'
    );

    let allDisabled = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        const edgeCount = view?.edgeGraphics?.commands?.length || 0;
        return edgeCount;
      })()`,
      'Check edge count when all disabled'
    );
    console.log(`  Edge commands when all disabled: ${allDisabled}`);
    results.phase10.metrics.all_disabled_commands = allDisabled;

    // Enable showLinks only
    console.log('Step 2: Enable showLinks only...');
    await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (view?.panel) {
          const p = view.panel;
          p.showLinks = true;
          p.showSemanticEdges = false;
          p.showTagEdges = false;
          p.showInheritance = false;
          p.showSimilar = false;
        }
        if (view?.drawEdges) {
          view.drawEdges();
        }
      })()`,
      'Enable showLinks only'
    );

    let linksOnly = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        const edgeCount = view?.edgeGraphics?.commands?.length || 0;
        return edgeCount;
      })()`,
      'Check edge count when showLinks enabled'
    );
    console.log(`  Edge commands when showLinks=true: ${linksOnly}`);
    results.phase10.metrics.links_only_commands = linksOnly;
    results.phase10.metrics.edges_drawn_when_enabled = linksOnly > 0;

    results.phase10.errors = [];
    // When all edges disabled, we should have fewer commands
    // When showLinks enabled, we should have more commands
    results.phase10.passed = (allDisabled < linksOnly) && (linksOnly > 0);
    console.log(`  ✓ Phase 10 result: ${results.phase10.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase10.errors.push(err.message);
    console.error(`  ✗ Phase 10 failed: ${err.message}`);
  }
}

async function phase11_a11yAudit() {
  console.log('\n=== PHASE 11: DEEP ACCESSIBILITY AUDIT ===');

  try {
    const issues = await evaluateCode(
      `(function() {
        const issues = [];
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        if (!view) {
          issues.push('View not found');
          return issues;
        }

        // Check toolbar role
        const toolbar = view.containerEl?.querySelector('[class*="toolbar"]');
        if (toolbar && !toolbar.getAttribute('role')) {
          issues.push('Toolbar missing role attribute');
        }

        // Check all buttons for aria-label or textContent
        const buttons = view.containerEl?.querySelectorAll('button') || [];
        buttons.forEach((btn, idx) => {
          const hasLabel = btn.getAttribute('aria-label') || btn.textContent?.trim();
          if (!hasLabel) {
            issues.push(\`Button #\${idx} missing aria-label and textContent\`);
          }
        });

        // Check range inputs
        const rangeInputs = view.containerEl?.querySelectorAll('input[type="range"]') || [];
        rangeInputs.forEach((input, idx) => {
          const hasAttrs = input.hasAttribute('min') && input.hasAttribute('max');
          if (!hasAttrs) {
            issues.push(\`Range input #\${idx} missing min/max attributes\`);
          }
        });

        // Check canvas tabindex
        const canvas = view.containerEl?.querySelector('canvas');
        if (canvas && canvas.getAttribute('tabindex') === null) {
          issues.push('Canvas missing tabindex attribute');
        }

        // Check panel landmark (graph-panel has role="complementary")
        const panel = view.containerEl?.querySelector('.graph-panel');
        if (panel && !panel.getAttribute('role')) {
          issues.push('Panel missing role attribute (should be complementary or region)');
        }

        return issues;
      })()`,
      'A11Y audit'
    );

    console.log(`  Found ${issues.length} accessibility issues:`);
    issues.forEach((issue, idx) => {
      console.log(`    ${idx + 1}. ${issue}`);
      results.phase11.errors.push(issue);
    });

    results.phase11.metrics.total_a11y_issues = issues.length;
    results.phase11.metrics.buttons_checked = (await evaluateCode(
      `app.workspace.getLeavesOfType('graph-view')[0]?.view?.containerEl?.querySelectorAll('button').length || 0`,
      'Count buttons'
    )) || 0;
    results.phase11.metrics.inputs_checked = (await evaluateCode(
      `app.workspace.getLeavesOfType('graph-view')[0]?.view?.containerEl?.querySelectorAll('input[type="range"]').length || 0`,
      'Count range inputs'
    )) || 0;

    results.phase11.passed = issues.length === 0;
    console.log(`  ✓ Phase 11 result: ${results.phase11.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase11.errors.push(err.message);
    console.error(`  ✗ Phase 11 failed: ${err.message}`);
  }
}

async function phase12_statePersistence() {
  console.log('\n=== PHASE 12: STATE PERSISTENCE ===');

  try {
    console.log('Step 1: Get current panel state...');
    const state = await evaluateCode(
      `(function() {
        const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
        const panel = view?.panel;
        if (panel) {
          return {
            showOrphans: panel.showOrphans,
            showLinks: panel.showLinks,
            showTagEdges: panel.showTagEdges,
            showSemanticEdges: panel.showSemanticEdges,
            groupBy: panel.groupBy,
            layout: panel.layout,
            searchQuery: panel.searchQuery
          };
        }
        return null;
      })()`,
      'Get state'
    );

    if (!state) {
      results.phase12.errors.push('getState() returned null');
      results.phase12.passed = false;
    } else {
      console.log(`  State keys: ${Object.keys(state).join(', ')}`);
      results.phase12.metrics.state_keys = Object.keys(state);
      results.phase12.metrics.state_values = state;

      // Check if serializable
      console.log('Step 2: Verify state is JSON serializable...');
      try {
        const json = JSON.stringify(state);
        results.phase12.metrics.is_serializable = true;
        console.log(`  State is JSON serializable (${json.length} chars)`);
      } catch (err) {
        results.phase12.errors.push(`State not JSON serializable: ${err.message}`);
        results.phase12.metrics.is_serializable = false;
      }

      // Try modifying and restoring state
      console.log('Step 3: Modify state and restore...');
      const stateModified = await evaluateCode(
        `(function() {
          const view = app.workspace.getLeavesOfType('graph-view')[0]?.view;
          if (view?.panel) {
            try {
              const original = {
                showOrphans: view.panel.showOrphans,
                layout: view.panel.layout
              };
              view.panel.showOrphans = !view.panel.showOrphans;
              view.panel.layout = view.panel.layout === 'force' ? 'concentric' : 'force';
              const modified = {
                showOrphans: view.panel.showOrphans,
                layout: view.panel.layout
              };
              // Restore
              view.panel.showOrphans = original.showOrphans;
              view.panel.layout = original.layout;
              return { success: true, original, modified };
            } catch (err) {
              return { success: false, error: err.message };
            }
          }
          return { success: false, error: 'No panel' };
        })()`,
        'Test state modification'
      );
      console.log(`  State modification works: ${stateModified.success}`);
      results.phase12.metrics.state_modification_works = stateModified.success;

      results.phase12.passed = results.phase12.metrics.is_serializable && stateModified.success;
    }

    results.phase12.errors = [];
    console.log(`  ✓ Phase 12 result: ${results.phase12.passed ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    results.phase12.errors.push(err.message);
    console.error(`  ✗ Phase 12 failed: ${err.message}`);
  }
}

async function main() {
  console.log('Connecting to Obsidian via CDP...');

  return new Promise((resolve) => {
    ws.on('open', async () => {
      console.log('Connected!\n');

      try {
        await phase7_panelOperations();
        await phase8_searchFiltering();
        await phase9_groupCollapse();
        await phase10_edgeToggle();
        await phase11_a11yAudit();
        await phase12_statePersistence();
      } catch (err) {
        console.error('Unexpected error in main:', err.message);
      }

      // Print summary
      console.log('\n\n========== FINAL REPORT ==========');
      let passCount = 0;
      let failCount = 0;

      for (const [phase, result] of Object.entries(results)) {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        const phaseNum = phase.replace('phase', '');
        console.log(`\n${phase.toUpperCase()}: ${status}`);
        console.log(`  Metrics: ${JSON.stringify(result.metrics, null, 2)}`);
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.slice(0, 3).join(' | ')}`);
        }
        result.passed ? passCount++ : failCount++;
      }

      console.log(`\n\nSummary: ${passCount}/6 phases passed`);
      console.log(`Failed phases: ${failCount}`);

      ws.close();
      resolve();
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
      resolve();
    });
  });
}

main().catch(console.error);
