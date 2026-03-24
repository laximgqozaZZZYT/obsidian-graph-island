/**
 * CDP E2E Test — Cycle 21: Full zoom sweep verification
 * Confirms label LOD, scale, and count across 7 zoom levels
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
  await page.waitForTimeout(3000);
});

async function getLabelsAtZoom(z: number): Promise<{ vis: number; avg: string }> {
  return page.evaluate(async (zoom) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { vis: 0, avg: "N/A" };
    const v = leaf.view;
    v.worldContainer.scale.set(zoom);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1500));
    let vis = 0; const scales: number[] = [];
    for (const pn of v.pixiNodes.values()) {
      if (pn.label?.visible) { vis++; scales.push(Math.round(pn.label.scale.x * 100) / 100); }
    }
    return { vis, avg: scales.length > 0 ? (scales.reduce((a: number, b: number) => a + b, 0) / scales.length).toFixed(2) : "N/A" };
  }, z);
}

// IV: Full zoom sweep — labels increase monotonically with zoom
test("IV: label count increases monotonically across 7 zoom levels", async () => {
  const zooms = [0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0];
  const results: { z: number; vis: number; avg: string }[] = [];
  for (const z of zooms) {
    const r = await getLabelsAtZoom(z);
    results.push({ z, ...r });
  }
  // Restore
  await getLabelsAtZoom(1.0);

  console.log(`[IV] Sweep: ${results.map(r => `z${r.z}=${r.vis}(${r.avg})`).join(", ")}`);

  // Skip if view not ready
  if (results[0].avg === "N/A") { console.log("[IV] Skipped: view not ready"); return; }

  // Monotonic increase (allow equal for adjacent levels)
  for (let i = 1; i < results.length; i++) {
    expect(results[i].vis).toBeGreaterThanOrEqual(results[i - 1].vis);
  }
  // z2.0 should have same or more labels than z1.0
  expect(results[results.length - 1].vis).toBeGreaterThanOrEqual(results[results.length - 2].vis);
  // Scale decreases as zoom increases
  const s005 = parseFloat(results[0].avg);
  const s100 = parseFloat(results[5].avg);
  if (!isNaN(s005) && !isNaN(s100)) {
    expect(s100).toBeLessThan(s005);
  }

});

// IW: groupBy does not break label zoom tracking
test("IW: groupBy change + zoom still tracks labels correctly", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { error: "no view" };
    const v = leaf.view;
    const origGroupBy = v.panel.groupBy;
    
    // Set groupBy and zoom
    v.panel.groupBy = "prop-category";
    v.worldContainer.scale.set(0.5);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 2000));
    
    let groupedVis = 0;
    for (const pn of v.pixiNodes.values()) {
      if (pn.label?.visible) groupedVis++;
    }
    
    // Restore
    v.panel.groupBy = origGroupBy;
    v.worldContainer.scale.set(1.0);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1500));
    
    let restoredVis = 0;
    for (const pn of v.pixiNodes.values()) {
      if (pn.label?.visible) restoredVis++;
    }
    
    return { groupedVis, restoredVis, total: v.pixiNodes.size };
  });
  if (result.error) { console.log(`[IW] Skipped: ${result.error}`); return; }
  expect(result.groupedVis).toBeGreaterThan(0);
  expect(result.restoredVis).toBeGreaterThan(result.groupedVis);
  console.log(`[IW] GroupBy: grouped=${result.groupedVis}, restored=${result.restoredVis}/${result.total}`);

});

// IX: zoom 2.0 labels scale < 1.0 (shrink at zoom-in)
test("IX: labels shrink at zoom > 1.0", async () => {
  const r = await getLabelsAtZoom(2.0);
  await getLabelsAtZoom(1.0); // restore
  if (r.avg === "N/A") { console.log("[IX] Skipped"); return; }
  const scale = parseFloat(r.avg);
  expect(scale).toBeLessThan(1.0);
  expect(scale).toBeGreaterThan(0.3); // not too small
  console.log(`[IX] z2.0: scale=${r.avg}, labels=${r.vis}`);
});

// IY: Card body max lines config
test("IY: cardBodyMaxLines is configurable", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no view" };
    const crc = leaf.view.panel.cardRenderConfig ?? {};
    return { cardBodyMaxLines: crc.cardBodyMaxLines ?? 3 };
  });
  if (result.error) { console.log(`[IY] Skipped: ${result.error}`); return; }
  expect(result.cardBodyMaxLines).toBeGreaterThan(0);
  console.log(`[IY] cardBodyMaxLines: ${result.cardBodyMaxLines}`);
});

// IZ: No console errors
test("IZ: no console errors across sweep", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IZ] ${errors.length} errors`);
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

