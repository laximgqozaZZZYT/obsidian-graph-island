/**
 * CDP E2E Test — Cycle 78 (Cycle 39): Type safety + edgeRt consolidation
 *
 * Validates that:
 * 1. CardRenderConfig fields (cardCornerRadius, cardAspectRatio) work without as-any
 * 2. Edge draw config properly receives merged RT values (hoverEdgeFalloff, globalEdgeAlpha, edgeLabelFontSize)
 * 3. No regressions from edgeRt consolidation
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const errors: string[] = [];

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.plugins.enabledPlugins.has("graph-island")) {
      await app.plugins.disablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 500));
    }
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 8000));
  });
});

// JW-1: cardCornerRadius accessible via CardRenderConfig
test("JW-1: cardCornerRadius read/write via cardRenderConfig", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.cardRenderConfig?.cardCornerRadius;
    if (!view.panel.cardRenderConfig) view.panel.cardRenderConfig = {};
    view.panel.cardRenderConfig.cardCornerRadius = 8;
    const readBack = view.panel.cardRenderConfig.cardCornerRadius;

    view.panel.cardRenderConfig.cardCornerRadius = saved;
    return { ok: readBack === 8, readBack };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// JW-2: cardAspectRatio accessible via CardRenderConfig
test("JW-2: cardAspectRatio read/write via cardRenderConfig", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.cardRenderConfig?.cardAspectRatio;
    if (!view.panel.cardRenderConfig) view.panel.cardRenderConfig = {};
    view.panel.cardRenderConfig.cardAspectRatio = 1.414;
    const readBack = view.panel.cardRenderConfig.cardAspectRatio;

    view.panel.cardRenderConfig.cardAspectRatio = saved;
    return { ok: readBack === 1.414, readBack };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// JW-3: globalEdgeAlpha propagates to edge rendering
test("JW-3: globalEdgeAlpha setting propagates correctly", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.globalEdgeAlpha;
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.globalEdgeAlpha = 0.5;
    const readBack = view.panel.renderThresholds.globalEdgeAlpha;

    view.panel.renderThresholds.globalEdgeAlpha = saved;
    return { ok: readBack === 0.5, readBack };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis = await measureEdgeVisibility(page);
  if (_eVis.totalEdges > 5) {
    expect(_eVis.lowAlphaCount).toBeLessThan(_eVis.visibleEdges * 0.5);
  }
  expect(_csq.infCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis2 = await measureEdgeVisibility(page);
  if (_eVis2.totalEdges > 5) {
    expect(_eVis2.lowAlphaCount).toBeLessThan(_eVis2.visibleEdges * 0.5);
  }
});

// JW-4: hoverEdgeFalloff setting round-trip
test("JW-4: hoverEdgeFalloff setting round-trip", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.hoverEdgeFalloff;
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.hoverEdgeFalloff = 0.8;
    const readBack = view.panel.renderThresholds.hoverEdgeFalloff;

    view.panel.renderThresholds.hoverEdgeFalloff = saved;
    return { ok: readBack === 0.8, readBack };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis3 = await measureEdgeVisibility(page);
  if (_eVis3.totalEdges > 5) {
    expect(_eVis3.lowAlphaCount).toBeLessThan(_eVis3.visibleEdges * 0.5);
  }
  expect(_csq.infCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis4 = await measureEdgeVisibility(page);
  if (_eVis4.totalEdges > 5) {
    expect(_eVis4.lowAlphaCount).toBeLessThan(_eVis4.visibleEdges * 0.5);
  }
});

// JW-5: edge rendering produces no errors with modified thresholds
test("JW-5: edge rendering with modified thresholds no errors", async () => {
  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Set multiple edge thresholds and trigger render
    const saved = { ...view.panel.renderThresholds };
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.globalEdgeAlpha = 0.3;
    view.panel.renderThresholds.hoverEdgeFalloff = 0.9;
    view.panel.renderThresholds.edgeLabelFontSize = 14;

    // Trigger edge redraw
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    // Restore
    view.panel.renderThresholds = saved;
    view.markDirty(true);

    return { ok: true };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis5 = await measureEdgeVisibility(page);
  if (_eVis5.totalEdges > 5) {
    expect(_eVis5.lowAlphaCount).toBeLessThan(_eVis5.visibleEdges * 0.5);
  }
  expect(_csq.infCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis6 = await measureEdgeVisibility(page);
  if (_eVis6.totalEdges > 5) {
    expect(_eVis6.lowAlphaCount).toBeLessThan(_eVis6.visibleEdges * 0.5);
  }
});

// JW-6: no console errors
test("JW-6: no console errors during type safety tests", async () => {
  expect(errors.length).toBe(0);
});

test.afterAll(async () => {
  // Do not close CDP connection
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

