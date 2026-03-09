import { chromium } from 'playwright';

/**
 * E2E Test: Panel State Persistence
 *
 * Validates that panel state survives plugin reload via getState/setState.
 * Flow:
 *   1. Connect to running Obsidian via CDP
 *   2. Read current panel state
 *   3. Mutate several panel fields to non-default values
 *   4. Force Obsidian to save workspace state
 *   5. Reload plugin (disable + enable)
 *   6. Compare restored state against expected values
 */

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No Obsidian page found'); process.exit(1); }

  console.log('=== E2E Test: Panel State Persistence ===\n');

  // Step 1: Find plugin ID
  const pluginId = await page.evaluate(() => {
    const plugins = Object.keys(app.plugins.plugins);
    return plugins.find(id => id.includes('graph-view') || id.includes('novel-graph')) || 'novel-graph-views';
  });
  console.log('Plugin ID:', pluginId);

  // Step 2: Ensure graph view leaf exists
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) {
      // Try to open via command
      app.commands.executeCommandById('novel-graph-views:open-graph-view');
    }
  });
  await page.waitForTimeout(3000);

  // Step 3: Read current default state
  const defaultState = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no graph-view leaf' };
    const view = leaves[0].view;
    return {
      panel: { ...view.panel },
      layout: view.currentLayout,
    };
  });
  if (defaultState.error) {
    console.log('ERROR:', defaultState.error);
    await browser.close();
    process.exit(1);
  }
  console.log('Default state keys:', Object.keys(defaultState.panel).length, 'fields');

  // Step 4: Mutate panel to non-default values
  const testValues = {
    nodeSize: 15,
    scaleByDegree: false,
    showArrows: true,
    hoverHops: 3,
    centerForce: 0.1,
    repelForce: 500,
    linkForce: 0.05,
    linkDistance: 200,
    clusterArrangement: 'grid',
    fadeEdgesByDegree: true,
    colorEdgesByRelation: false,
    showOrphans: false,
    textFadeThreshold: 0.8,
    clusterNodeSpacing: 5.0,
    clusterGroupScale: 4.0,
    clusterGroupSpacing: 3.0,
    enclosureSpacing: 2.5,
  };

  await page.evaluate((vals) => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return;
    const view = leaves[0].view;
    for (const [key, value] of Object.entries(vals)) {
      view.panel[key] = value;
    }
  }, testValues);
  console.log('Mutated', Object.keys(testValues).length, 'panel fields');

  // Step 5: Force Obsidian to save workspace layout
  await page.evaluate(() => {
    app.workspace.requestSaveLayout();
  });
  await page.waitForTimeout(2000);  // Wait for debounced save

  // Step 6: Verify getState returns our values
  const stateBeforeReload = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const view = leaves[0].view;
    const state = view.getState();
    return state;
  });
  console.log('\n--- getState() before reload ---');
  if (stateBeforeReload.panel) {
    let getStateOk = 0;
    let getStateFail = 0;
    for (const [key, expected] of Object.entries(testValues)) {
      const actual = stateBeforeReload.panel[key];
      const match = JSON.stringify(actual) === JSON.stringify(expected);
      if (match) {
        getStateOk++;
      } else {
        getStateFail++;
        console.log(`  FAIL getState: ${key} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
      }
    }
    console.log(`getState: ${getStateOk}/${Object.keys(testValues).length} fields correct`);
    if (getStateFail > 0) {
      console.log('ERROR: getState() does not return mutated values. Fix getState().');
      await browser.close();
      process.exit(1);
    }
  }

  // Step 7: Reload plugin
  console.log('\nReloading plugin...');
  await page.evaluate(async (id) => {
    await app.plugins.disablePlugin(id);
    await new Promise(r => setTimeout(r, 1500));
    await app.plugins.enablePlugin(id);
  }, pluginId);
  await page.waitForTimeout(4000);

  // Step 8: Find the graph-view leaf again (may need to wait for setState)
  const restoredState = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no graph-view leaf after reload' };
    const view = leaves[0].view;
    return {
      panel: { ...view.panel },
      layout: view.currentLayout,
    };
  });

  if (restoredState.error) {
    console.log('ERROR:', restoredState.error);
    // Try opening the view
    await page.evaluate(() => {
      app.commands.executeCommandById('novel-graph-views:open-graph-view');
    });
    await page.waitForTimeout(3000);
  }

  // Step 9: Compare restored state
  console.log('\n--- Restored state after reload ---');
  const finalState = restoredState.error ? await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'still no leaf' };
    const view = leaves[0].view;
    return { panel: { ...view.panel }, layout: view.currentLayout };
  }) : restoredState;

  if (finalState.error) {
    console.log('ERROR:', finalState.error);
    await browser.close();
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const [key, expected] of Object.entries(testValues)) {
    const actual = finalState.panel[key];
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
    console.log('ALL PASSED - Panel state persists across plugin reload');
  } else {
    console.log(`\n${failed} fields NOT restored`);
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
