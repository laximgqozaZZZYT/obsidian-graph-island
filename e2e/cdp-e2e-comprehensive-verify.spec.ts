/**
 * CDP E2E: Comprehensive verification of core boolean toggles.
 * Verifies that each toggle produces a measurable visual change.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(300_000);

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

test("showArrows toggle changes edge rendering", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.showLinks = true;
    view.panel.showArrows = false;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const off = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showArrows = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  expect(pixelDiff(off, on)).toBeGreaterThan(100);
});

test("showEnclosures toggle changes group boundary rendering", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.groupByRules = [{ key: "prop-category" }];
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.panel.showEnclosures = true;
    await view.doRender();
  `));
  await page.waitForTimeout(4000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showEnclosures = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  expect(pixelDiff(on, off)).toBeGreaterThan(100);
});

test("scaleByDegree toggle changes node size distribution", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.scaleByDegree = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.scaleByDegree = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  expect(pixelDiff(off, on)).toBeGreaterThan(100);
});

test("nodeColorMode category vs default produces different node colors", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.nodeColorMode = "default";
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const def = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeColorMode = "category";
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const cat = await page.screenshot();

  expect(pixelDiff(def, cat)).toBeGreaterThan(100);
});

test("showLabels toggle affects label visibility", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
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

  expect(pixelDiff(on, off)).toBeGreaterThan(100);
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

