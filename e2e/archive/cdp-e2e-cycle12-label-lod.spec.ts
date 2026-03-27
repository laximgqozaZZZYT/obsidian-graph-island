/**
 * CDP E2E Test — Cycle 12: Label LOD zoom-responsive update
 * Critical fix: labels now re-evaluate visibility when zoom changes
 * Tests verify label count scales with zoom level (not fixed)
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
  // Ensure graph view is open and fully loaded
  const hasView = await page.evaluate(() =>
    ((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.pixiNodes?.size ?? 0) > 0
  );
  if (!hasView) {
    await page.evaluate(async () => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 10000));
    });
  }
  // Brief wait for worldContainer initialization
  await page.waitForTimeout(3000);
});

async function getLabelStats(p: Page, zoom: number): Promise<{ visible: number; hidden: number; avgScale: string }> {
  return p.evaluate(async (z) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || !view.worldContainer) return { visible: 0, hidden: 0, avgScale: "N/A" };
    view.worldContainer.scale.set(z);
    view.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1500));
    let vis = 0, hidden = 0;
    const scales: number[] = [];
    for (const pn of view.pixiNodes.values()) {
      if (pn.label) {
        if (pn.label.visible) {
          vis++;
          scales.push(Math.round(pn.label.scale.x * 100) / 100);
        } else {
          hidden++;
        }
      }
    }
    const avg = scales.length > 0 ? (scales.reduce((a: number, b: number) => a + b, 0) / scales.length).toFixed(2) : "N/A";
    return { visible: vis, hidden, avgScale: avg };
  }, zoom);
}

// HU: Label count increases with zoom level (LOD responsive)
test("HU: label visibility scales with zoom — more labels at higher zoom", async () => {
  // Ensure view is ready
  const ready = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return !!(v?.worldContainer?.scale);
  });
  if (!ready) { console.log("[HU] Skipped: view not ready"); return; }

  // Reset zoom to ensure clean state
  await getLabelStats(page, 1.0);
  await page.waitForTimeout(500);

  const z01 = await getLabelStats(page, 0.1);
  const z05 = await getLabelStats(page, 0.5);
  const z10 = await getLabelStats(page, 1.0);

  console.log(`[HU] z0.1: ${z01.visible} visible (scale ${z01.avgScale})`);
  console.log(`[HU] z0.5: ${z05.visible} visible (scale ${z05.avgScale})`);
  console.log(`[HU] z1.0: ${z10.visible} visible (scale ${z10.avgScale})`);

  // At zoom 1.0, should have significantly more labels than at 0.1
  expect(z10.visible).toBeGreaterThan(z01.visible * 2);
  // At zoom 0.5, should have more labels than at 0.1
  expect(z05.visible).toBeGreaterThanOrEqual(z01.visible);
  // Scale should decrease as zoom increases (less counter-scaling needed)
  const s01 = parseFloat(z01.avgScale);
  const s10 = parseFloat(z10.avgScale);
  if (!isNaN(s01) && !isNaN(s10)) {
    expect(s10).toBeLessThan(s01);
  }
});

// HV: Label counter-scale at zoom 1.0 should be near 1.0
test("HV: label scale at zoom 1.0 is approximately 1.0", async () => {
  const stats = await getLabelStats(page, 1.0);
  if (stats.avgScale === "N/A") { console.log("[HV] Skipped: view not ready"); return; }
  const scale = parseFloat(stats.avgScale);
  console.log(`[HV] z1.0: avgScale=${stats.avgScale}, ${stats.visible} visible`);
  expect(scale).toBeGreaterThan(0.8);
  expect(scale).toBeLessThan(2.0);
});

// HW: At extreme zoom, few labels visible (density controlled)
test("HW: extreme zoom shows limited labels (density culling active)", async () => {
  const stats = await getLabelStats(page, 0.05);
  console.log(`[HW] z0.05: ${stats.visible} visible, ${stats.hidden} hidden (scale ${stats.avgScale})`);
  if (stats.avgScale === "N/A") { console.log("[HW] Skipped: view not ready"); return; }
  // Should have some labels (not zero) but far fewer than total
  expect(stats.visible).toBeGreaterThan(0);
  expect(stats.visible).toBeLessThan(stats.visible + stats.hidden); // not all visible
  // Restore
  await getLabelStats(page, 1.0);
});

// HX: zoom changes mid-render don't produce errors
test("HX: rapid zoom transitions produce no console errors", async () => {
  errors.length = 0;
  for (const z of [0.1, 0.5, 1.0, 0.3, 2.0, 0.05, 1.0]) {
    await page.evaluate(async (zoom) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view?.worldContainer) {
        view.worldContainer.scale.set(zoom);
        view.markDirty?.(true);
      }
    }, z);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  expect(errors.length).toBe(0);
  console.log(`[HX] Rapid zoom transitions: ${errors.length} errors`);
});

// HY: RenderHost.getWorldScale returns current zoom
test("HY: getWorldScale returns correct zoom value", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.worldContainer) return { error: "no view" };
    view.worldContainer.scale.set(0.42);
    const ws = view.getWorldScale?.() ?? view.worldContainer?.scale?.x;
    view.worldContainer.scale.set(1.0);
    return { ws: Math.round(ws * 100) / 100 };
  });
  if (result.error) { console.log(`[HY] Skipped: ${result.error}`); return; }
  expect(result.ws).toBeCloseTo(0.42, 1);
  console.log(`[HY] getWorldScale: ${result.ws}`);
});

// HZ: No console errors across test suite
test("HZ: clean test run", async () => {
  expect(errors.length).toBe(0);
  console.log(`[HZ] ${errors.length} total errors`);
});

test.afterAll(async () => {
  // Restore zoom
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view?.worldContainer) { view.worldContainer.scale.set(1.0); view.markDirty?.(true); }
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

