/**
 * Full Audit — comprehensive visual verification of all major setting categories
 *
 * Tests node shapes, card mode, donut mode, group settings, and enclosure display
 * using screenshot comparison for visual changes.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function applySettings(settings: Record<string, unknown>, callbackType: "data" | "dirty" | "render" = "render"): Promise<void> {
  await page.evaluate(async ([s, cb]: [Record<string, unknown>, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") (p as any)[k] = new Set(v as string[]);
      else (p as any)[k] = v;
    }
    if (cb === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (cb === "dirty" && view.panelCallbacks) view.panelCallbacks.markDirty();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  }, [settings, callbackType]);
}

async function setupFiltered(): Promise<void> {
  await applySettings({
    searchQuery: "folder:characters",
    showTags: false,
    showTagNodes: false,
    nodeDisplayMode: "node",
    clusterArrangement: "spiral",
    groupBy: "none",
    groupByRules: [],
    collapsedGroups: [],
  }, "data");
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await setupFiltered();
});

test.afterAll(async () => {});

test.describe("Full Audit — Visual Verification", () => {

  test("nodeDisplayMode card vs node produces visual change", async () => {
    await setupFiltered();
    await applySettings({ nodeDisplayMode: "node" });
    await page.waitForTimeout(1000);
    const s1 = await page.screenshot();

    await applySettings({ nodeDisplayMode: "card" });
    await page.waitForTimeout(1000);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(500);
    console.log(`card vs node: pixel diff = ${diff}`);
  });

  test("nodeDisplayMode donut vs node produces visual change", async () => {
    await setupFiltered();
    await applySettings({ nodeDisplayMode: "node" });
    await page.waitForTimeout(1000);
    const s1 = await page.screenshot();

    await applySettings({ nodeDisplayMode: "donut" });
    await page.waitForTimeout(1000);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`donut vs node: pixel diff = ${diff}`);
  });

  test("groupBy creates visible group enclosures", async () => {
    await setupFiltered();
    await applySettings({ groupBy: "none", groupByRules: [], collapsedGroups: [] }, "data");
    await page.waitForTimeout(1000);
    const s1 = await page.screenshot();

    await applySettings({ groupByRules: [{ key: "prop-category" }], collapsedGroups: [] }, "data");
    await page.waitForTimeout(1000);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`groupBy: pixel diff = ${diff}`);
  });

  test("tagDisplay enclosure vs node produces visual change", async () => {
    await applySettings({ showTags: true, showTagNodes: true, tagDisplay: "node" }, "data");
    await page.waitForTimeout(1000);
    const s1 = await page.screenshot();

    await applySettings({ tagDisplay: "enclosure" }, "data");
    await page.waitForTimeout(1000);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`tagDisplay: pixel diff = ${diff}`);
  });

  test("showMinimap toggle adds minimap overlay", async () => {
    await setupFiltered();
    await applySettings({ showMinimap: false }, "dirty");
    await page.waitForTimeout(1000);
    const s1 = await page.screenshot();

    await applySettings({ showMinimap: true }, "dirty");
    await page.waitForTimeout(1000);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(100);
    console.log(`showMinimap: pixel diff = ${diff}`);
  });
});


// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }
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

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

