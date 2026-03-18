/**
 * CDP E2E: Verify various bug fixes are working correctly.
 * Tests guideline rendering, grid table mode, and edge visibility toggles.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(180_000);

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

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (a[i] !== b[i]) diff++; }
  return diff + Math.abs(a.length - b.length);
}

test("showLinks toggle hides/shows link edges", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.showLinks = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showLinks = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  expect(pixelDiff(on, off)).toBeGreaterThan(100);
});

test("gridStyle lines vs table produces visual change in grid arrangement", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.gridStyle = "lines";
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    view.markDirty(true);
  `));
  await page.waitForTimeout(4000);
  const lines = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.gridStyle = "table";
    view.applyClusterForce();
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const table = await page.screenshot();

  const diff = pixelDiff(lines, table);
  console.log(`gridStyle lines vs table: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});

test("showSimilar toggle changes edge count", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showSimilar = false;
    view.panel.showLinks = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const offResult: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    return { edgeCount: gd.edges.length, nodeCount: gd.nodes.length };
  `));

  await page.evaluate(ev(`
    view.panel.showSimilar = true;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(4000);

  const onResult: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    return { edgeCount: gd.edges.length, nodeCount: gd.nodes.length };
  `));

  // Enabling showSimilar should change edge count (semantic edges)
  console.log(`showSimilar OFF edges=${offResult.edgeCount}, ON edges=${onResult.edgeCount}`);
  expect(onResult.edgeCount).not.toBe(offResult.edgeCount);
});

test("edgeDirectionFilter changes which edges are displayed", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showLinks = true;
    view.panel.edgeDirectionFilter = "all";
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const all = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.edgeDirectionFilter = "bidirectional";
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const bidir = await page.screenshot();

  expect(pixelDiff(all, bidir)).toBeGreaterThan(100);
});
