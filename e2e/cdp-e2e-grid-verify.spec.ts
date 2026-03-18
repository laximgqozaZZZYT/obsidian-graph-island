/**
 * CDP E2E: Verify grid layout and grid overlay settings.
 * Tests gridStyle, gridCellShading, gridShowHeaders, gridLabelPlacement.
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

test("grid arrangement produces grid-like node positions", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0 };
    const xs = [], ys = [];
    for (const [, n] of pn) {
      xs.push(Math.round(n.data.x));
      ys.push(Math.round(n.data.y));
    }
    return {
      count: pn.size,
      xSpread: Math.max(...xs) - Math.min(...xs),
      ySpread: Math.max(...ys) - Math.min(...ys),
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.xSpread).toBeGreaterThan(100);
  expect(result.ySpread).toBeGreaterThan(100);
});

test("gridCellShading ON vs OFF produces visual change", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "grid";
    view.panel.gridStyle = "table";
    view.panel.gridCellShading = false;
    view.applyClusterForce();
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const off = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.gridCellShading = true;
    view.applyClusterForce();
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const on = await page.screenshot();

  expect(pixelDiff(off, on)).toBeGreaterThan(100);
});

test("gridShowHeaders toggle affects header rendering", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "grid";
    view.panel.gridShowHeaders = true;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.gridShowHeaders = false;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const off = await page.screenshot();

  expect(pixelDiff(on, off)).toBeGreaterThan(100);
});

test("gridLabelPlacement on-line vs between produces visual change", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "grid";
    view.panel.gridShowHeaders = true;
    view.panel.gridLabelPlacement = "on-line";
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const online = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.gridLabelPlacement = "between";
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const between = await page.screenshot();

  expect(pixelDiff(online, between)).toBeGreaterThan(100);
});
