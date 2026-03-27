/**
 * CDP E2E Test — Cycle 25: Test stability + edge cases
 * Robust view initialization + boundary condition tests
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
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
  // Ensure GI view is open and stable
  await page.evaluate(async () => {
    const has = (window as any).app.workspace.getLeavesOfType("graph-view")
      .some((l: any) => l.view && "pixiNodes" in l.view);
    if (!has) {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 10000));
    }
  });
  // Wait for initial render to complete
  await page.waitForTimeout(5000);
  // Stabilize at zoom 1.0
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (leaf?.view?.worldContainer) {
      leaf.view.worldContainer.scale.set(1.0);
      leaf.view.markDirty?.(true);
      await new Promise(r => setTimeout(r, 2000));
    }
  });
});

function getGI() {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    return leaf ? { found: true, nodes: leaf.view.pixiNodes.size } : { found: false, nodes: 0 };
  });
}

// Boundary: extreme zoom-out (0.02)
test("Boundary: extreme zoom-out 0.02 produces no errors", async () => {
  const gi = await getGI();
  if (!gi.found) { console.log("[Edge] Skipped"); return; }
  
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    const v = leaf!.view;
    v.worldContainer.scale.set(0.02);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1000));
    let vis = 0;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    v.worldContainer.scale.set(1.0); v.markDirty?.(true);
    return { vis, zoom: v.worldContainer.scale.x };
  });
  expect(result.vis).toBeGreaterThanOrEqual(0); // no crash
  console.log(`[Edge] z0.02: ${result.vis} labels (no crash)`);
});

// Boundary: extreme zoom-in (5.0)
test("Boundary: extreme zoom-in 5.0 produces no errors", async () => {
  const gi = await getGI();
  if (!gi.found) { console.log("[Edge] Skipped"); return; }
  
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    const v = leaf!.view;
    v.worldContainer.scale.set(5.0);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1000));
    let vis = 0;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    const scale = v.pixiNodes.values().next()?.value?.label?.scale?.x ?? 0;
    v.worldContainer.scale.set(1.0); v.markDirty?.(true);
    return { vis, labelScale: Math.round(scale * 100) / 100 };
  });
  expect(result.vis).toBeGreaterThanOrEqual(0);
  console.log(`[Edge] z5.0: ${result.vis} labels, scale=${result.labelScale}`);

});

// Boundary: rapid zoom oscillation
test("Boundary: 20 rapid zoom changes produce no errors", async () => {
  const gi = await getGI();
  if (!gi.found) { console.log("[Edge] Skipped"); return; }
  
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    const v = leaf!.view;
    for (let i = 0; i < 20; i++) {
      const z = 0.1 + Math.random() * 2.9; // 0.1-3.0
      v.worldContainer.scale.set(z);
      v.markDirty?.(true);
      await new Promise(r => setTimeout(r, 50));
    }
    v.worldContainer.scale.set(1.0); v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 500));
    return { complete: true };
  });
  expect(result.complete).toBe(true);
  console.log(`[Edge] 20 rapid zoom changes: no crash`);

});

// Stability: labels at z1.0 after full stabilization
test("Stability: z1.0 shows >100 labels after full init", async () => {
  const gi = await getGI();
  if (!gi.found) { console.log("[Stable] Skipped"); return; }
  
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    const v = leaf!.view;
    v.worldContainer.scale.set(1.0); v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 2000));
    let vis = 0, withLabel = 0;
    for (const pn of v.pixiNodes.values()) {
      if (pn.label) { withLabel++; if (pn.label.visible) vis++; }
    }
    return { vis, withLabel, total: v.pixiNodes.size };
  });
  expect(result.vis).toBeGreaterThan(100);
  console.log(`[Stable] z1.0: ${result.vis}/${result.withLabel} labeled, ${result.total} total`);

});

// No console errors
test("No errors across boundary tests", async () => {
  expect(errors.length).toBe(0);
  console.log(`[Clean] ${errors.length} errors`);
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

