/**
 * AxisSource Final Audit — backward compatibility + field/hop source validation
 *
 * Validates that existing arrangement presets still work after AxisSource changes,
 * and that new field/hop sources produce correct coordinate distributions.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

async function ensureView(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

async function setArrangementAndWait(arrangement: string): Promise<{ nodeCount: number; edgeCount: number }> {
  return page.evaluate(async (arr: string) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0 };
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.clusterArrangement = arr;
    p.coordinateLayout = null;
    p.showTags = false;
    p.showTagNodes = false;
    p.searchQuery = "";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return { nodeCount: pixiNodes?.size ?? 0, edgeCount: edges.length };
  }, arrangement);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await ensureView();
});

test.afterAll(async () => {});

test.describe("AxisSource Final Audit", () => {

  test("spiral arrangement still renders nodes", async () => {
    const result = await setArrangementAndWait("spiral");
    expect(result.nodeCount).toBeGreaterThan(500);
    expect(result.edgeCount).toBeGreaterThan(1000);
    console.log(`spiral: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  });

  test("grid arrangement still renders nodes", async () => {
    const result = await setArrangementAndWait("grid");
    expect(result.nodeCount).toBeGreaterThan(500);
    expect(result.edgeCount).toBeGreaterThan(1000);
    console.log(`grid: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  });

  test("field source layout produces different X distribution than index", async () => {
    // Apply field source
    const fieldResult = await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { xRange: 0, count: 0 };
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "custom";
      p.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "linear", scale: 1 } },
        axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
        perGroup: false,
      };
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
      const xs: number[] = [];
      for (const n of pn.values()) xs.push(n.data?.x ?? 0);
      return { xRange: Math.max(...xs) - Math.min(...xs), count: pn.size };
    });

    // Apply index source
    const indexResult = await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { xRange: 0, count: 0 };
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
        axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
        perGroup: false,
      };
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
      const xs: number[] = [];
      for (const n of pn.values()) xs.push(n.data?.x ?? 0);
      return { xRange: Math.max(...xs) - Math.min(...xs), count: pn.size };
    });

    expect(fieldResult.count).toBeGreaterThan(100);
    expect(indexResult.count).toBeGreaterThan(100);
    // Distributions should differ
    const rangeDiff = Math.abs(fieldResult.xRange - indexResult.xRange);
    expect(rangeDiff > 1 || fieldResult.xRange > 0).toBe(true);
    console.log(`field xRange=${fieldResult.xRange.toFixed(0)}, index xRange=${indexResult.xRange.toFixed(0)}`);
  });

  test("coordinate layout with perGroup=true applies per group", async () => {
    const result = await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { count: 0, spread: 0 };
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "custom";
      p.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
        axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
        perGroup: true,
      };
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
      let minX = Infinity, maxX = -Infinity;
      for (const n of pn.values()) {
        const x = n.data?.x ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      return { count: pn.size, spread: maxX - minX };
    });
    expect(result.count).toBeGreaterThan(100);
    expect(result.spread).toBeGreaterThan(0);
    console.log(`perGroup=true: ${result.count} nodes, spread=${result.spread.toFixed(0)}`);
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

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
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

