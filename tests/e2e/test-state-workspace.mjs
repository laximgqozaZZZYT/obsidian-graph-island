import { chromium } from 'playwright';

/**
 * E2E Test: Workspace-level State Persistence
 *
 * Validates that panel state is saved to workspace.json and survives
 * a full workspace reload (simulated via leaf close + reopen).
 * This is closer to what happens on Obsidian restart.
 */

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No Obsidian page found'); process.exit(1); }

  console.log('=== E2E Test: Workspace State Persistence ===\n');

  // Step 1: Ensure graph view exists
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) {
      app.commands.executeCommandById('novel-graph-views:open-graph-view');
    }
  });
  await page.waitForTimeout(3000);

  // Step 2: Set non-default values
  const testValues = {
    nodeSize: 12,
    showArrows: true,
    hoverHops: 4,
    clusterArrangement: 'tree',
    fadeEdgesByDegree: true,
    showOrphans: false,
    repelForce: 777,
    linkDistance: 333,
    scaleByDegree: false,
  };

  await page.evaluate((vals) => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return;
    const view = leaves[0].view;
    for (const [key, value] of Object.entries(vals)) {
      view.panel[key] = value;
    }
  }, testValues);
  console.log('Set', Object.keys(testValues).length, 'non-default values');

  // Step 3: Force workspace save
  await page.evaluate(() => {
    app.workspace.requestSaveLayout();
  });
  await page.waitForTimeout(2000);

  // Step 4: Verify workspace.json has our state
  const workspaceState = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const leaf = leaves[0];
    // Get the leaf's serialized state (what goes into workspace.json)
    const leafState = leaf.getViewState();
    return leafState;
  });
  console.log('Leaf view state type:', workspaceState?.type);
  console.log('Has state.panel:', !!workspaceState?.state?.panel);
  if (workspaceState?.state?.panel) {
    console.log('state.panel.nodeSize:', workspaceState.state.panel.nodeSize);
    console.log('state.panel.showArrows:', workspaceState.state.panel.showArrows);
    console.log('state.panel.clusterArrangement:', workspaceState.state.panel.clusterArrangement);
  }

  // Step 5: Close the graph view leaf completely
  console.log('\nClosing graph view leaf...');
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length > 0) {
      leaves[0].detach();
    }
  });
  await page.waitForTimeout(1000);

  // Step 6: Reopen the graph view via the saved workspace state
  console.log('Reopening graph view with saved state...');
  await page.evaluate((savedState) => {
    const leaf = app.workspace.getLeaf('tab');
    leaf.setViewState(savedState);
    app.workspace.revealLeaf(leaf);
  }, workspaceState);
  await page.waitForTimeout(4000);

  // Step 7: Check restored values
  const restoredState = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no graph-view leaf' };
    const view = leaves[0].view;
    return { panel: { ...view.panel } };
  });

  if (restoredState.error) {
    console.log('ERROR:', restoredState.error);
    await browser.close();
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const [key, expected] of Object.entries(testValues)) {
    const actual = restoredState.panel[key];
    const match = JSON.stringify(actual) === JSON.stringify(expected);
    if (match) {
      passed++;
    } else {
      failed++;
      failures.push({ key, expected, actual });
    }
  }

  console.log(`\n=== Results: ${passed}/${Object.keys(testValues).length} fields restored ===\n`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  FAIL: ${f.key}`);
      console.log(`    expected: ${JSON.stringify(f.expected)}`);
      console.log(`    actual:   ${JSON.stringify(f.actual)}`);
    }
  }

  if (failed === 0) {
    console.log('ALL PASSED - Workspace state persistence works');
  } else {
    console.log(`\n${failed} fields NOT restored after workspace reload`);
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
