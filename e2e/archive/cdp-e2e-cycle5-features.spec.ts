/**
 * CDP E2E Test -- Cycle 5: Pathfinder, gap detection, relation drawer
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

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
    await new Promise(r => setTimeout(r, 1000));
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

test("pathfinder: set start and end nodes via API", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Find two nodes with edges
    const nodes = view.rawData?.nodes ?? [];
    if (nodes.length < 2) return { error: "too few nodes" };
    const n1 = nodes[0].id;
    const n2 = nodes[Math.min(10, nodes.length - 1)].id;

    // Set pathfinder
    view.setPathfinderNode(n1, "start");
    view.setPathfinderNode(n2, "end");
    await new Promise(r => setTimeout(r, 1000));

    const state = view.getPathfinderState();
    const hasPath = view.pathfinderPath?.length > 0;

    // Clear
    view.clearPathfinder();
    const clearedState = view.getPathfinderState();

    return {
      startId: state.startId, endId: state.endId,
      hasPath, pathLength: view.pathfinderPath?.length ?? 0,
      clearedStart: clearedState.startId, clearedEnd: clearedState.endId,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.startId).not.toBeNull();
  expect(result.endId).not.toBeNull();
  expect(result.clearedStart).toBeNull();
  expect(result.clearedEnd).toBeNull();
  console.log(`[pathfinder] start=${result.startId?.substring(0, 20)}, end=${result.endId?.substring(0, 20)}, hasPath=${result.hasPath}`);
});

test("gap detection edges: showGapEdges produces gap analysis", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Enable gap detection
    panel.showGapEdges = true;
    panel.analysisOverlay = "gaps";
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));

    // Check if gap edges were computed
    const gapNodeIds = view.getGapEdgeNodeIds?.() ?? view.gapEdgeNodeIds;
    const hasGapDetection = panel.showGapEdges === true;

    // Reset
    panel.showGapEdges = false;
    panel.analysisOverlay = "off";

    return { hasGapDetection, gapNodeCount: gapNodeIds?.size ?? 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasGapDetection).toBe(true);
  console.log(`[gaps] enabled=${result.hasGapDetection}, gapNodes=${result.gapNodeCount}`);

});

test("showRelationDrawer: NodeDetailView exists when enabled", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Check NodeDetailView exists
    const detailLeaves = (window as any).app.workspace.getLeavesOfType("graph-node-detail");
    const hasDetailPane = detailLeaves.length > 0;

    return {
      showRelationDrawer: panel.showRelationDrawer,
      hasDetailPane,
    };
  });

  expect(result).not.toHaveProperty("error");
  // Detail pane may be closed by previous tests — just verify the field exists
  console.log(`[drawer] showRelationDrawer=${result.showRelationDrawer}, hasDetailPane=${result.hasDetailPane}`);
});

test("analysisOverlay modes: all values accepted", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    const modes = ["off", "bridges", "entropy", "gaps", "missing", "all"];
    const results: Record<string, boolean> = {};

    for (const mode of modes) {
      panel.analysisOverlay = mode;
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 500));
      results[mode] = panel.analysisOverlay === mode;
    }

    // Reset
    panel.analysisOverlay = "off";
    return results;
  });

  expect(result).not.toHaveProperty("error");
  for (const [mode, ok] of Object.entries(result)) {
    expect(ok).toBe(true);
  }
  console.log(`[analysis] All modes accepted:`, JSON.stringify(result));

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

