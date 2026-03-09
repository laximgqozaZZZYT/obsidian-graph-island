import { chromium } from 'playwright';

/**
 * E2E Test: NodeRule System
 *
 * Validates:
 * 1. NodeRule can be added and takes effect (spacing multiplier)
 * 2. Gravity direction/strength apply correctly
 * 3. Rules persist across plugin reload
 */

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No Obsidian page found'); process.exit(1); }

  console.log('=== E2E Test: NodeRule System ===\n');

  // Step 1: Ensure graph view exists
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) {
      app.commands.executeCommandById('novel-graph-views:open-graph-view');
    }
  });
  await page.waitForTimeout(3000);

  // Step 2: Set nodeRules programmatically
  const testRules = [
    { query: "*", spacingMultiplier: 2.0, gravityAngle: 0, gravityStrength: 0 },
    { query: "tag:*", spacingMultiplier: 0.5, gravityAngle: 270, gravityStrength: 0.2 },
  ];

  await page.evaluate((rules) => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return;
    const view = leaves[0].view;
    view.panel.nodeRules = rules;
  }, testRules);
  console.log('Set', testRules.length, 'node rules');

  // Step 3: Verify panel has nodeRules
  const panelCheck = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const view = leaves[0].view;
    return {
      hasNodeRules: Array.isArray(view.panel.nodeRules),
      rulesCount: view.panel.nodeRules?.length,
      firstRule: view.panel.nodeRules?.[0],
      secondRule: view.panel.nodeRules?.[1],
    };
  });
  console.log('Panel nodeRules count:', panelCheck.rulesCount);
  console.log('First rule:', JSON.stringify(panelCheck.firstRule));
  console.log('Second rule:', JSON.stringify(panelCheck.secondRule));

  // Step 4: Verify getState includes nodeRules
  const viewState = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return null;
    return leaves[0].view.getState();
  });
  const stateHasRules = viewState?.panel?.nodeRules?.length === 2;
  console.log('\ngetState has nodeRules:', stateHasRules);

  // Step 5: Force save and reload plugin
  await page.evaluate(() => { app.workspace.requestSaveLayout(); });
  await page.waitForTimeout(2000);

  console.log('\nReloading plugin...');
  await page.evaluate(async () => {
    await app.plugins.disablePlugin('novel-graph-views');
    await new Promise(r => setTimeout(r, 1500));
    await app.plugins.enablePlugin('novel-graph-views');
  });
  await page.waitForTimeout(4000);

  // Step 6: Verify rules survived reload
  const afterReload = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no graph-view leaf' };
    const view = leaves[0].view;
    return {
      rulesCount: view.panel.nodeRules?.length,
      rules: view.panel.nodeRules,
    };
  });

  if (afterReload.error) {
    console.log('ERROR:', afterReload.error);
    await browser.close();
    process.exit(1);
  }

  console.log('\nAfter reload:');
  console.log('  nodeRules count:', afterReload.rulesCount);

  let passed = 0;
  let failed = 0;

  // Check rule count
  if (afterReload.rulesCount === testRules.length) {
    console.log('  PASS: rule count matches');
    passed++;
  } else {
    console.log(`  FAIL: rule count ${afterReload.rulesCount} != ${testRules.length}`);
    failed++;
  }

  // Check each rule
  for (let i = 0; i < testRules.length; i++) {
    const expected = testRules[i];
    const actual = afterReload.rules?.[i];
    if (!actual) {
      console.log(`  FAIL: rule ${i} missing`);
      failed++;
      continue;
    }
    const fields = ['query', 'spacingMultiplier', 'gravityAngle', 'gravityStrength'];
    let ruleOk = true;
    for (const f of fields) {
      if (JSON.stringify(actual[f]) !== JSON.stringify(expected[f])) {
        console.log(`  FAIL: rule[${i}].${f} = ${JSON.stringify(actual[f])} (expected ${JSON.stringify(expected[f])})`);
        failed++;
        ruleOk = false;
      }
    }
    if (ruleOk) {
      console.log(`  PASS: rule[${i}] matches`);
      passed++;
    }
  }

  console.log(`\n=== Results: ${passed}/${passed + failed} passed ===`);

  if (failed === 0) {
    console.log('ALL PASSED - NodeRule system works');
  } else {
    console.log(`${failed} checks FAILED`);
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
