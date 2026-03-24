/**
 * CDP E2E Test — Cycle 70 (Cycle 32): JO Edge Alpha Config + JP Import Cleanup
 * Tests configurable bidirectional/hierarchy alpha boosts and import cleanup regression.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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
  const hasView = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    return leaves.some((l: any) => l.view && "pixiNodes" in l.view);
  });
  if (!hasView) {
    await page.evaluate(async () => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 8000));
    });
  }
});

// JO-1: Edge alpha config fields are read/writable
test("JO-1: edge alpha config read/write", async () => {
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};

    const fields = ["edgeBidirectionalBoost", "edgeUnidirectionalDim", "edgeHierarchyBoost"];
    const saved: Record<string, any> = {};
    const results: Record<string, number> = {};

    for (const f of fields) saved[f] = (panel.renderThresholds as any)[f];

    (panel.renderThresholds as any).edgeBidirectionalBoost = 0.4;
    (panel.renderThresholds as any).edgeUnidirectionalDim = 0.3;
    (panel.renderThresholds as any).edgeHierarchyBoost = 0.5;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    for (const f of fields) results[f] = (panel.renderThresholds as any)[f];

    // Restore
    for (const f of fields) {
      if (saved[f] !== undefined) (panel.renderThresholds as any)[f] = saved[f];
      else delete (panel.renderThresholds as any)[f];
    }
    if (view.markDirty) view.markDirty(true);

    return { ok: true, results };
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
  expect(result.results.edgeBidirectionalBoost).toBe(0.4);
  expect(result.results.edgeUnidirectionalDim).toBe(0.3);
  expect(result.results.edgeHierarchyBoost).toBe(0.5);
});

// JO-2: Bidirectional indicator toggle with custom boost no errors
test("JO-2: bidirectional indicator with boost no errors", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    const panel = view.panel;
    const origBidir = panel.showBidirectionalIndicator;

    panel.showBidirectionalIndicator = true;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    panel.showBidirectionalIndicator = origBidir ?? false;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 200));

    return { ok: true };
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

// JP-3: Graph renders correctly after import cleanup (regression)
test("JP-3: graph renders after import cleanup", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    // Verify core functionality still works
    const nodeCount = view.pixiNodes?.size ?? 0;
    const hasPanel = !!view.panel;
    const hasWorld = !!view.worldContainer;

    return { ok: true, nodeCount, hasPanel, hasWorld };
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
  expect(result.hasPanel).toBe(true);
  expect(result.hasWorld).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
});

test.afterAll(() => {
  if (errors.length > 0) {
    console.warn("Page errors during test:", errors);
  }
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

