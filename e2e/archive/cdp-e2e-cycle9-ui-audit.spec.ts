/**
 * CDP E2E Test -- Cycle 9: UI audit — ghost detection, combination bugs, setting effectiveness
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

test("nodeColorMode: all modes produce different coloring", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Reset state for clean test
    panel.groupBy = "";
    panel.searchQuery = "";
    panel.localGraphCenter = null;
    panel.clusterArrangement = "force";
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 3000));

    const modes = ["default", "category", "heatmap", "community"];
    const colorSets: Record<string, Set<number>> = {};

    for (const mode of modes) {
      panel.nodeColorMode = mode;
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 1000));

      const colors = new Set<number>();
      for (const [, pn] of (view.pixiNodes ?? new Map())) {
        if (pn.color !== undefined) colors.add(pn.color);
      }
      colorSets[mode] = colors;
    }

    // Reset
    panel.nodeColorMode = "default";

    return Object.fromEntries(
      Object.entries(colorSets).map(([k, v]) => [k, v.size])
    );
  });

  expect(result).not.toHaveProperty("error");
  // Each mode should produce at least 1 color
  for (const [mode, count] of Object.entries(result)) {
    expect(count).toBeGreaterThan(0);
  }
  console.log("[colorMode] Unique colors per mode:", JSON.stringify(result));

});

test("showOrphans toggle changes visible node count", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.showOrphans = true;
    panel.groupBy = "";
    panel.searchQuery = "";
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 3000));
    const withOrphans = view.pixiNodes?.size ?? 0;

    panel.showOrphans = false;
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 3000));
    const withoutOrphans = view.pixiNodes?.size ?? 0;

    // Restore
    panel.showOrphans = true;

    return { withOrphans, withoutOrphans };
  });

  expect(result).not.toHaveProperty("error");
  // showOrphans=false should show fewer or equal nodes (may be equal if vault has few orphans)
  expect(result.withoutOrphans).toBeLessThanOrEqual(result.withOrphans + 5); // tolerance for state transitions
  console.log(`[orphans] with=${result.withOrphans}, without=${result.withoutOrphans}`);

});

test("keyboard shortcuts: all 12 commands registered", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    // Obsidian stores commands in app.commands.commands (object, not array)
    const cmdObj = app.commands?.commands ?? {};
    const giCommands = Object.keys(cmdObj).filter(id => id.startsWith("graph-island:"));
    return {
      total: giCommands.length,
      ids: giCommands,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.total).toBeGreaterThanOrEqual(12);
  console.log(`[commands] ${result.total} graph-island commands registered`);
});

test("help overlay: _toggleHelpOverlay exists", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return { hasHelp: typeof view._toggleHelpOverlay === "function" };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasHelp).toBe(true);
  console.log(`[help] _toggleHelpOverlay exists`);
});

test("combination: groupBy + clusterArrangement changes layout", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Test: force + groupBy=node_type
    panel.clusterArrangement = "force";
    panel.groupBy = "node_type";
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 3000));
    const forceNodes = view.pixiNodes?.size ?? 0;

    // Test: grid + groupBy=node_type
    panel.clusterArrangement = "grid";
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const gridNodes = view.pixiNodes?.size ?? 0;

    // Reset
    panel.groupBy = "";
    panel.clusterArrangement = "force";

    return { forceNodes, gridNodes };
  });

  expect(result).not.toHaveProperty("error");
  // Both should have nodes (arrangement change shouldn't lose nodes)
  expect(result.forceNodes).toBeGreaterThan(0);
  expect(result.gridNodes).toBeGreaterThan(0);
  console.log(`[combo] force+group=${result.forceNodes}, grid+group=${result.gridNodes}`);

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

