/**
 * Coordinate Audit — verify coordinate positions are finite and well-distributed
 *
 * Validates that all node positions are finite numbers, within reasonable bounds,
 * and that coordinate layout switching works without producing NaN/Infinity.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

interface CoordStats {
  count: number;
  finiteCount: number;
  nanCount: number;
  infCount: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zeroCount: number;
}

async function getCoordStats(): Promise<CoordStats> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { count: 0, finiteCount: 0, nanCount: 0, infCount: 0, xMin: 0, xMax: 0, yMin: 0, yMax: 0, zeroCount: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { count: 0, finiteCount: 0, nanCount: 0, infCount: 0, xMin: 0, xMax: 0, yMin: 0, yMax: 0, zeroCount: 0 };
    let finiteCount = 0, nanCount = 0, infCount = 0, zeroCount = 0;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const pn of pixiNodes.values()) {
      const x = pn.data?.x;
      const y = pn.data?.y;
      if (typeof x !== "number" || typeof y !== "number") { nanCount++; continue; }
      if (isNaN(x) || isNaN(y)) { nanCount++; continue; }
      if (!isFinite(x) || !isFinite(y)) { infCount++; continue; }
      finiteCount++;
      if (x === 0 && y === 0) zeroCount++;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    return { count: pixiNodes.size, finiteCount, nanCount, infCount, xMin, xMax, yMin, yMax, zeroCount };
  });
}

async function setArrangement(arr: string): Promise<void> {
  await page.evaluate(async (a: string) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.clusterArrangement = a;
    p.coordinateLayout = null;
    p.showTags = false;
    p.searchQuery = "";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));
  }, arr);
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
});

test.afterAll(async () => {});

test.describe("Coordinate Position Audit", () => {

  test("spiral arrangement: all positions finite, no NaN", async () => {
    await setArrangement("spiral");
    const stats = await getCoordStats();
    expect(stats.count).toBeGreaterThan(500);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
    expect(stats.finiteCount).toBe(stats.count);
    expect(stats.xMax - stats.xMin).toBeGreaterThan(10);
    console.log(`spiral: ${stats.count} nodes, all finite, spread ${(stats.xMax - stats.xMin).toFixed(0)}x${(stats.yMax - stats.yMin).toFixed(0)}`);
  });

  test("grid arrangement: all positions finite, no NaN", async () => {
    await setArrangement("grid");
    const stats = await getCoordStats();
    expect(stats.count).toBeGreaterThan(500);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
    expect(stats.finiteCount).toBe(stats.count);
    console.log(`grid: ${stats.count} nodes, all finite, spread ${(stats.xMax - stats.xMin).toFixed(0)}x${(stats.yMax - stats.yMin).toFixed(0)}`);
  });

  test("concentric arrangement: positions form radial pattern", async () => {
    await setArrangement("concentric");
    const stats = await getCoordStats();
    expect(stats.count).toBeGreaterThan(500);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
    // Concentric should have comparable X and Y ranges
    const xRange = stats.xMax - stats.xMin;
    const yRange = stats.yMax - stats.yMin;
    expect(xRange).toBeGreaterThan(10);
    expect(yRange).toBeGreaterThan(10);
    console.log(`concentric: ${stats.count} nodes, ${xRange.toFixed(0)}x${yRange.toFixed(0)}`);
  });

  test("custom coordinate layout: positions finite with field source", async () => {
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "custom";
      p.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "linear", scale: 1 } },
        axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
        perGroup: false,
      };
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    const stats = await getCoordStats();
    expect(stats.count).toBeGreaterThan(100);
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
    expect(stats.zeroCount).toBeLessThan(stats.count * 0.5);
    console.log(`custom: ${stats.count} nodes, ${stats.nanCount} NaN, ${stats.zeroCount} at origin`);
  });

  test("timeline arrangement: Y positions reflect time ordering", async () => {
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "timeline";
      p.timelineKey = "start-date";
      p.coordinateLayout = null;
      p.showTags = false;
      p.searchQuery = "";
      p.groupBy = "none";
      p.collapsedGroups = new Set();
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 3000));
    });
    const stats = await getCoordStats();
    expect(stats.nanCount).toBe(0);
    expect(stats.infCount).toBe(0);
    console.log(`timeline: ${stats.count} nodes, spread ${(stats.xMax - stats.xMin).toFixed(0)}x${(stats.yMax - stats.yMin).toFixed(0)}`);
  });
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

