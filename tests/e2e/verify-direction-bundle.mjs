/**
 * E2E test: Direction×Color edge bundling visual verification.
 * Takes screenshots at bundleStrength 0, 0.5, and 1.0 for comparison.
 */
import { chromium } from 'playwright';

async function setBundleStrengthAndRender(page, value) {
  await page.evaluate((v) => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    if (view.panel) view.panel.edgeBundleStrength = v;
    if (typeof view.markDirty === 'function') view.markDirty();
  }, value);
  await page.waitForTimeout(800);
}

async function fitToScreen(page) {
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    const btns = view.containerEl?.querySelectorAll('.graph-toolbar-btn') || [];
    for (const btn of btns) {
      if (btn.getAttribute('aria-label') === '全体俯瞰') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(800);
}

async function getCanvasClip(page) {
  return page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return null;
    const el = leaves[0].view.containerEl?.querySelector('.view-content');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.error('No Obsidian page found'); process.exit(1); }

  console.log('Connected to Obsidian');

  // Ensure graph view is active
  await page.evaluate(async () => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length > 0) {
      app.workspace.setActiveLeaf(leaves[0]);
    }
  });
  await page.waitForTimeout(500);

  const stats = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return null;
    const v = leaves[0].view;
    return {
      nodeCount: v.pixiNodes?.size ?? 0,
      edgeCount: v.rawData?.edges?.length ?? 0,
      bundleStrength: v.panel?.edgeBundleStrength,
    };
  });
  console.log(`Graph: ${stats?.nodeCount} nodes, ${stats?.edgeCount} edges, current bundleStrength=${stats?.bundleStrength}`);

  if (!stats || stats.nodeCount === 0) {
    console.error('ERROR: Graph not rendered');
    await browser.close();
    process.exit(1);
  }

  const dir = 'tests/e2e/screenshots';

  // Take screenshots at 3 bundle strengths
  for (const strength of [0, 0.5, 1.0]) {
    console.log(`\n--- bundleStrength = ${strength.toFixed(2)} ---`);
    await setBundleStrengthAndRender(page, strength);
    await fitToScreen(page);
    await page.waitForTimeout(500);

    const label = strength.toFixed(2);
    const clip = await getCanvasClip(page);
    if (clip && clip.width > 0) {
      await page.screenshot({ path: `${dir}/dir-bundle-${label}.png`, clip });
      console.log(`  Saved: dir-bundle-${label}.png`);
    }
    await page.screenshot({ path: `${dir}/dir-bundle-${label}-full.png` });
    console.log(`  Saved: dir-bundle-${label}-full.png`);
  }

  // Restore default
  await setBundleStrengthAndRender(page, 0.65);

  console.log('\n=== Direction-bundle verification complete ===');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
