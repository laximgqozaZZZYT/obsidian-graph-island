import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.error('No Obsidian page'); process.exit(1); }

  // Set arrangement to triangle
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    if (view.panel) view.panel.clusterArrangement = 'triangle';
    if (typeof view.applyClusterForce === 'function') view.applyClusterForce();
    if (view.simulation) view.simulation.alpha(0.5).restart();
  });
  console.log('Set arrangement to triangle, waiting for simulation...');
  await page.waitForTimeout(8000);

  // Fit to screen
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const btns = leaves[0].view.containerEl?.querySelectorAll('.graph-toolbar-btn') || [];
    for (const btn of btns) {
      if (btn.getAttribute('aria-label') === '全体俯瞰') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(1000);

  // Canvas clip
  const clip = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return null;
    const el = leaves[0].view.containerEl?.querySelector('.view-content');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  const dir = 'tests/e2e/screenshots';
  if (clip && clip.width > 0) {
    await page.screenshot({ path: `${dir}/arr-triangle.png`, clip });
    console.log('Saved: arr-triangle.png');
  }
  await page.screenshot({ path: `${dir}/arr-triangle-full.png` });
  console.log('Saved: arr-triangle-full.png');

  // Restore spiral
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    if (view.panel) view.panel.clusterArrangement = 'spiral';
    if (typeof view.applyClusterForce === 'function') view.applyClusterForce();
    if (view.simulation) view.simulation.alpha(0.3).restart();
  });

  console.log('Done');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
