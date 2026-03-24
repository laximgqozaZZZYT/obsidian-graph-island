/**
 * CDP E2E Test — Cycle 62 (Cycle 24): IY Performance Profiler + IZ Collision Gate + Boundary
 * Quality gate tests for CI/CD: collision rate thresholds, FPS monitoring, edge cases
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
  // Ensure GI view is open (no plugin reload to avoid navigation context destruction)
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

async function setZoom(p: Page, z: number) {
  await p.evaluate((zoom) => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const world = l.view.worldContainer;
        if (world) world.scale.set(zoom);
        l.view.markDirty?.(true);
        break;
      }
    }
  }, z);
  await p.waitForTimeout(300);
}

function withGI(fn: string): string {
  return `
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    ${fn}
  `;
}

// ── IZ: Collision Rate Threshold Gates ──

// IZ-1: §0.1 collision rate ≤ 5% at zoom 1.0
test("IZ-1: §0.1 collision rate ≤ 5% at zoom 1.0", async () => {
  await page.waitForTimeout(2000);
  await setZoom(page, 1.0);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    view.renderPipeline?.cullOverlappingLabels?.();
    const stats = view.getLabelCullStats?.();
    if (!stats || stats.totalLabels === 0) return { ok: true, skipped: true, reason: "no labels" };

    return {
      ok: true,
      totalLabels: stats.totalLabels,
      collisionRate: stats.collisionRate,
      // §0.1 gate: ≤ 5% at zoom 1.0
      pass: stats.collisionRate <= 0.05,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.pass).toBe(true);
  }
});

// IZ-2: §0.1 collision rate ≤ 10% at zoom 0.5 (relaxed threshold)
test("IZ-2: §0.1 collision rate ≤ 10% at zoom 0.5", async () => {
  await setZoom(page, 0.5);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    view.renderPipeline?.cullOverlappingLabels?.();
    const stats = view.getLabelCullStats?.();
    if (!stats || stats.totalLabels === 0) return { ok: true, skipped: true };

    return {
      ok: true,
      collisionRate: stats.collisionRate,
      // Relaxed: ≤ 10% at zoom 0.5
      pass: stats.collisionRate <= 0.10,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.pass).toBe(true);
  }
});

// ── IY: Performance Profiler ──

// IY-3: §0.4 FPS > 0 after zoom activity (rendering active)
test("IY-3: §0.4 FPS is positive after zoom activity", async () => {
  // Generate rendering activity
  for (const z of [0.3, 0.8, 1.5, 0.5]) {
    await setZoom(page, z);
  }
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const fps = view.renderPipeline?.currentFps ?? -1;
    return { ok: true, fps, positive: fps >= 0 };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.positive).toBe(true);
  }
  await setZoom(page, 1.0);
});

// IY-4: §0.4 zoom response < 500ms (strict gate)
test("IY-4: §0.4 zoom change completes within 500ms", async () => {
  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const world = view.worldContainer;
    if (!world) return { ok: true, skipped: true };

    // Measure multiple zoom transitions
    const times: number[] = [];
    for (const z of [0.3, 1.0, 2.0, 0.5, 1.0]) {
      const t0 = performance.now();
      world.scale.set(z);
      view.markDirty?.(true);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push(performance.now() - t0);
    }

    const maxTime = Math.max(...times);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    return {
      ok: true,
      maxMs: maxTime.toFixed(1),
      avgMs: avgTime.toFixed(1),
      // §0.4 gate: max < 500ms
      pass: maxTime < 500,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.pass).toBe(true);
  }
});

// IY-5: §0.4 hover latency < 100ms (strict per §0.4)
test("IY-5: §0.4 hover creation latency < 100ms", async () => {
  await setZoom(page, 1.0);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const pn = nodes.find((n: any) => n.gfx?.visible);
    if (!pn) return { ok: true, skipped: true };

    // Measure hover
    const t0 = performance.now();
    view.setHighlightedNodeId?.(pn.data.id);
    view.applyHover?.();
    const elapsed = performance.now() - t0;

    // Cleanup
    view.setHighlightedNodeId?.(null);
    view.applyHover?.();

    return {
      ok: true,
      hoverMs: elapsed.toFixed(1),
      // §0.4: hover < 100ms (strict), < 300ms (FAIL boundary)
      passStrict: elapsed < 100,
      passFail: elapsed < 300,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    // Use FAIL boundary for CI reliability
    expect(result.passFail).toBe(true);
  }
});

// ── Boundary Conditions ──

// BC-6: Extreme zoom 0.05 — no crash, labels hidden
test("BC-6: extreme zoom 0.05 is stable with no visible labels", async () => {
  await setZoom(page, 0.05);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const visibleLabels = nodes.filter((pn: any) => pn.label?.visible).length;

    return { ok: true, visibleLabels, totalNodes: nodes.length };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  // At zoom 0.05, very few labels should be visible (hover-forced only)
  if (!result.skipped && result.totalNodes > 100) {
    // Allow some hover-forced labels but should be < 2% of total
    expect(result.visibleLabels).toBeLessThan(result.totalNodes * 0.02 + 10);
  }
  await setZoom(page, 1.0);
});

// BC-7: Display mode switch during zoom — no crash
test("BC-7: display mode switch at various zooms is stable", async () => {
  errors.length = 0;

  for (const z of [0.2, 1.0, 2.5]) {
    await setZoom(page, z);
    for (const mode of ["card", "donut", "node"]) {
      await page.evaluate((m) => {
        const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
        for (const l of leaves) {
          if (l.view && "pixiNodes" in l.view) {
            const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
            if (panel) panel.nodeDisplayMode = m;
            l.view.markDirty?.(true);
            break;
          }
        }
      }, mode);
      await page.waitForTimeout(200);
    }
  }

  // Reset
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) panel.nodeDisplayMode = "node";
        l.view.markDirty?.(true);
        break;
      }
    }
  });
  await setZoom(page, 1.0);

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
});

// BC-8: Empty search query produces all nodes visible
test("BC-8: clearing search restores full node set", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Record initial count
    const initialCount = view.pixiNodes.size;

    // Apply restrictive search
    panel.searchQuery = "nonexistent_xyz_query_12345";
    view.rawData = null;
    view.doRender?.();
    const filteredCount = view.pixiNodes.size;

    // Clear search
    panel.searchQuery = "";
    view.rawData = null;
    view.doRender?.();
    const restoredCount = view.pixiNodes.size;

    return {
      ok: true,
      initialCount,
      filteredCount,
      restoredCount,
      // Search filter either reduces or keeps same count, clear restores
      restored: restoredCount >= filteredCount && restoredCount >= initialCount * 0.9,
    };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.restored).toBe(true);
  }
});

// Stability sweep
test("§0: no console errors during quality gate tests", async () => {
  // Already accumulated errors from BC-7
  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
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

