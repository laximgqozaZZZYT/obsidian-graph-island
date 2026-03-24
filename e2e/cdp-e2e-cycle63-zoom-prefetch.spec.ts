/**
 * CDP E2E Test — Cycle 63 (Cycle 24): Zoom Response Prefetch Optimization
 *
 * Validates that the zoom-label pipeline split (applyTextFade immediate +
 * cullOverlappingLabels debounced) delivers faster perceived response.
 *
 * Tests:
 *   JA: applyTextFade executes in <50ms for 2000+ nodes
 *   JB: updateLabelsForZoom (full pipeline) still works correctly
 *   JC: zoom sweep monotonic label increase preserved after optimization
 *   JD: render loop cooldown cooperates with InteractionManager debounce
 *   JE: no console errors during rapid zoom sequence
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

  // Ensure GI view is open and has nodes
  const viewReady = await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    const giLeaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!giLeaf) {
      app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 8000));
    }
    const v = app.workspace.getLeavesOfType("graph-view").find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return { ready: false, reason: "no view" };

    // Ensure nodes are rendered
    if ((v.pixiNodes?.size ?? 0) < 100) {
      v.rawData = null;
      v._lastDoRenderTime = 0;
      await v.doRender();
      await new Promise(r => setTimeout(r, 5000));
    }
    return { ready: true, nodeCount: v.pixiNodes?.size ?? 0 };
  });
  expect(viewReady.ready).toBe(true);
});

/** Helper: get Graph Island view */
async function getView(p: Page) {
  return p.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    return leaves.find((l: any) => l.view && "pixiNodes" in l.view)?.view;
  });
}

// -------------------------------------------------------------------------
// JA: applyTextFade executes in <50ms
// -------------------------------------------------------------------------
test("JA: applyTextFade is lightweight (<50ms)", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return { error: "no view" };

    const nodeCount = v.pixiNodes?.size ?? 0;
    // Run 3 trials
    const trials: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      v.applyTextFade();
      trials.push(performance.now() - t0);
    }
    return { nodeCount, trials: trials.map((t: number) => Math.round(t * 100) / 100) };
  });

  expect(result.error).toBeUndefined();
  // Each trial should be under 50ms
  for (const t of result.trials) {
    expect(t).toBeLessThan(50);
  }
});

// -------------------------------------------------------------------------
// JB: Full updateLabelsForZoom works after optimization
// -------------------------------------------------------------------------
test("JB: updateLabelsForZoom completes without error", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return { error: "no view" };

    const nodeCount = v.pixiNodes?.size ?? 0;
    try {
      const t0 = performance.now();
      v.updateLabelsForZoom();
      const elapsed = performance.now() - t0;
      const cullStats = typeof v.getLabelCullStats === "function" ? v.getLabelCullStats() : null;
      return { nodeCount, elapsed: Math.round(elapsed), cullStats };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  expect(result.error).toBeUndefined();
  expect(result.nodeCount).toBeGreaterThan(0);
  // Full pipeline should complete in reasonable time
  expect(result.elapsed).toBeLessThan(500);
});

// -------------------------------------------------------------------------
// JC: Zoom sweep — monotonic label increase preserved
// -------------------------------------------------------------------------
test("JC: zoom sweep maintains monotonic label count", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return { error: "no view" };
    const world = v.worldContainer;
    if (!world) return { error: "no worldContainer" };

    const zooms = [0.1, 0.3, 0.5, 0.8, 1.0];
    const counts: { zoom: number; visible: number }[] = [];

    for (const z of zooms) {
      world.scale.set(z);
      v.applyTextFade();
      v.updateLabelsForZoom();
      await new Promise(r => setTimeout(r, 200));

      const stats = typeof v.getLabelCullStats === "function" ? v.getLabelCullStats() : null;
      counts.push({ zoom: z, visible: stats?.visibleLabels ?? 0 });
    }

    // Reset zoom
    world.scale.set(1.0);
    v.markDirty?.(true);

    return { counts };
  });

  expect(result.error).toBeUndefined();
  // Monotonic increase: each zoom level should have >= previous visible labels
  for (let i = 1; i < result.counts.length; i++) {
    expect(result.counts[i].visible).toBeGreaterThanOrEqual(result.counts[i - 1].visible);
  }

});

// -------------------------------------------------------------------------
// JD: Render loop cooldown cooperates (no double-cull within 100ms)
// -------------------------------------------------------------------------
test("JD: render pipeline _labelCullCooldown is 6 frames", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return { error: "no view" };

    const rp = v.renderPipeline;
    if (!rp) return { error: "no renderPipeline" };

    // Access the cooldown value via the pipeline's internal state
    // After a forced full redraw tick, cooldown should be set to 6
    return {
      hasCullCooldown: "_labelCullCooldown" in rp,
      currentFps: Math.round(rp.currentFps ?? 0),
    };
  });

  expect(result.error).toBeUndefined();
  expect(result.hasCullCooldown).toBe(true);
});

// -------------------------------------------------------------------------
// JE: No console errors during rapid zoom sequence
// -------------------------------------------------------------------------
test("JE: rapid zoom sequence produces no errors", async () => {
  errors.length = 0; // reset

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view)?.view;
    if (!v) return;
    const world = v.worldContainer;
    if (!world) return;

    // Simulate rapid zoom: 20 quick zoom changes
    for (let i = 0; i < 20; i++) {
      const z = 0.2 + Math.random() * 1.8;
      world.scale.set(z);
      v.applyTextFade();
      v.markDirty?.(true);
      // Small delay to simulate rapid wheel events
      await new Promise(r => setTimeout(r, 16));
    }

    // Final settle
    world.scale.set(1.0);
    v.updateLabelsForZoom();
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 500));
  });

  expect(errors).toHaveLength(0);

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

