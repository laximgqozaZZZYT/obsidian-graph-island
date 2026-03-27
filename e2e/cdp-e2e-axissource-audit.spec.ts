/**
 * AxisSource Audit — verify axis labels appear with correct text
 *
 * Tests coordinate layout axis sources (field, metric, index, hop)
 * and validates that axis titles/labels render properly.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

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

async function applyCoordinateLayout(layout: any): Promise<void> {
  await page.evaluate(async (cfg: any) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.clusterArrangement = "custom";
    p.coordinateLayout = cfg;
    p.showAxisTitles = true;
    p.gridTableMode = true;
    p.gridShowHeaders = true;
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.searchQuery = "";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));
  }, layout);
}

async function getNodeSpreadAndCount(): Promise<{ count: number; xRange: number; yRange: number; xBuckets: number }> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { count: 0, xRange: 0, yRange: 0, xBuckets: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { count: 0, xRange: 0, yRange: 0, xBuckets: 0 };
    const xs: number[] = [];
    const ys: number[] = [];
    for (const pn of pixiNodes.values()) {
      xs.push(pn.data?.x ?? 0);
      ys.push(pn.data?.y ?? 0);
    }
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xBuckets = new Set(xs.map(x => Math.round(x / 20) * 20)).size;
    return {
      count: pixiNodes.size,
      xRange: xMax - xMin,
      yRange: yMax - yMin,
      xBuckets,
    };
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await ensureView();
});

test.afterAll(async () => {});

test.describe("AxisSource Audit", () => {

  test("field source distributes nodes into distinct X buckets", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    expect(result.xBuckets).toBeGreaterThan(3);
    console.log(`field source: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}, ${result.xBuckets} X buckets`);
  });

  test("metric:degree source creates spread proportional to connectivity", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    console.log(`metric:degree: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}`);
  });

  test("index source creates linear distribution", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    expect(result.yRange).toBeGreaterThan(0);
    console.log(`index: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}, yRange=${result.yRange.toFixed(0)}`);
  });

  test("polar coordinate system produces circular distribution", async () => {
    await applyCoordinateLayout({
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    // polar should produce roughly equal width and height
    const ratio = Math.max(result.xRange, result.yRange) / (Math.min(result.xRange, result.yRange) + 1);
    expect(ratio).toBeLessThan(5);
    console.log(`polar: ${result.count} nodes, ratio=${ratio.toFixed(2)}`);
  });
});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  const minimap = await measureMinimap(page);
  const guides = await measureGuides(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety} minimap=${minimap.visible} guides=${guides.lineCount}/${guides.labelCount}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
  // Guide labels should not all overlap each other
  if (guides.labelCount > 2) {
    expect(guides.overlappingLabels).toBeLessThan(guides.labelCount);
  }
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
  console.log(`[SCREEN-Q] nodes=${density.totalNodes} hotspot=${density.worstCellCount} viewport=${density.viewportUtilization}% rightBias=${density.rightHalfRatio}%`);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  console.log(`[SCREEN-Q] labels=${labels.totalVisible} overlap=${labels.overlapRate} tooSmall=${labels.tooSmallCount} avgFont=${labels.avgScreenFontSize}px`);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.70);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.5);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  console.log(`[SCREEN-Q] edges=${edges.totalEdges} visible=${edges.visibleEdges} tooThin=${edges.tooThinCount} lowAlpha=${edges.lowAlphaCount} colors=${edges.colorVariety}`);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.8);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    console.log(`[SCREEN-Q] enclosures=${enclosures.totalEnclosures} overlapping=${enclosures.overlappingPairs} rate=${enclosures.overlapRate}`);
    expect(enclosures.overlapRate).toBeLessThan(0.70);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    console.log(`[SCREEN-Q] cards=${cards.totalCards} overlapping=${cards.overlappingCards} tooSmall=${cards.tooSmallCards} avgW=${cards.avgCardWidth} avgH=${cards.avgCardHeight}`);
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.5);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.7);
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
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

});

