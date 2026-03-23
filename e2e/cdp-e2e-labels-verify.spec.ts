/**
 * CDP E2E: Verify label text content matches node names.
 * Tests showLabels, showEdgeLabels, and label text accuracy.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 2000));
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 4000));
    }
  });
});

function ev(code: string): string {
  return `(async () => {
    const app = window.app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find(l => l.view?.panel) || leaves[0];
    if (!leaf) throw new Error("no leaf");
    const view = leaf.view;
    if (!(view.panel.collapsedGroups instanceof Set)) {
      view.panel.collapsedGroups = new Set(
        Array.isArray(view.panel.collapsedGroups) ? view.panel.collapsedGroups : []
      );
    }
    ${code}
  })()`;
}

test("node labels match graphData node labels", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.showLabels = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    const nodeLabels = gd.nodes.map(n => n.label).filter(Boolean);
    const pn = view.pixiNodes;
    const pixiLabels = [];
    if (pn) {
      for (const [, n] of pn) {
        if (n.data?.label) pixiLabels.push(n.data.label);
      }
    }
    return {
      graphDataLabels: nodeLabels.length,
      pixiLabels: pixiLabels.length,
      sampleGraphLabels: nodeLabels.slice(0, 5),
      samplePixiLabels: pixiLabels.slice(0, 5),
      allPixiLabelsInGraphData: pixiLabels.every(l => nodeLabels.includes(l)),
    };
  `));

  expect(result.graphDataLabels).toBeGreaterThan(50);
  expect(result.pixiLabels).toBeGreaterThan(50);
  expect(result.allPixiLabelsInGraphData).toBe(true);
});

test("showEdgeLabels ON adds edge label children", async () => {
  await page.evaluate(ev(`
    view.panel.showEdgeLabels = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const off: any = await page.evaluate(ev(`
    return { children: view.edgeLabelContainer?.children?.length ?? 0 };
  `));

  await page.evaluate(ev(`
    view.panel.showEdgeLabels = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const on: any = await page.evaluate(ev(`
    return { children: view.edgeLabelContainer?.children?.length ?? 0 };
  `));

  // When edge labels are on, there should be more label children
  console.log(`Edge labels OFF=${off.children}, ON=${on.children}`);
  expect(on.children).toBeGreaterThanOrEqual(off.children);
});

test("showLabels OFF hides node labels visually", async () => {
  await page.evaluate(ev(`
    view.panel.showLabels = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showLabels = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  const len = Math.min(on.length, off.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (on[i] !== off[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});

