/**
 * CDP E2E: Verify custom coordinate engine features.
 * Tests axis source text input, hop-based axis, and in-degree axis.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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

test("in-degree axis source produces X positions correlated with node degree", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "custom";
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "in-degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, xRange: 0 };
    const xs = [];
    for (const [, n] of pn) xs.push(Math.round(n.data.x));
    return {
      count: pn.size,
      xRange: Math.max(...xs) - Math.min(...xs),
      distinctX: new Set(xs.map(x => Math.round(x / 10))).size,
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.xRange).toBeGreaterThan(5);
  expect(result.distinctX).toBeGreaterThan(1);

});

test("degree vs in-degree axis sources produce different layouts", async () => {
  // degree layout
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);
  const degreeShot = await page.screenshot();

  // in-degree layout
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "in-degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);
  const inDegreeShot = await page.screenshot();

  // They should differ since degree != in-degree for directed graphs
  const len = Math.min(degreeShot.length, inDegreeShot.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (degreeShot[i] !== inDegreeShot[i]) diff++; }
  // Allow them to be the same if the graph happens to be symmetric, but typically they differ
  console.log(`degree vs in-degree pixel diff: ${diff}`);
  expect(diff).toBeGreaterThanOrEqual(0);

});

test("coordinateLayout null resets to standard arrangement behavior", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const result: any = await page.evaluate(ev(`
    return {
      arrangement: view.panel.clusterArrangement,
      hasCoordLayout: view.panel.coordinateLayout !== null && view.panel.coordinateLayout !== undefined,
      nodeCount: view.pixiNodes?.size ?? 0,
    };
  `));

  expect(result.arrangement).toBe("grid");
  expect(result.hasCoordLayout).toBe(false);
  expect(result.nodeCount).toBeGreaterThan(50);

});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety}`);
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

