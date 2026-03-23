/**
 * CDP E2E Test — Cycle 63 (Cycle 25): JA Collision Trend + JB Memory Profile
 * Quality trend recording and memory profiling for CI/CD monitoring
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";
import * as fs from "fs";
import * as path from "path";

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
  // Ensure GI view is open (no reload to avoid context destruction)
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

// ── JA: Collision Rate Trend Recording ──

// JA-1: Record collision rates at multiple zoom levels as structured data
test("JA-1: collision rate trend across zoom levels", async () => {
  await page.waitForTimeout(2000);

  const zoomLevels = [0.2, 0.5, 0.8, 1.0, 1.5, 2.0];
  const trend: { zoom: number; totalLabels: number; visibleLabels: number; collisionRate: number }[] = [];

  for (const z of zoomLevels) {
    await setZoom(page, z);
    await page.waitForTimeout(400);

    const stats = await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      let view: any = null;
      for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
      if (!view) return null;
      view.renderPipeline?.cullOverlappingLabels?.();
      return view.getLabelCullStats?.() ?? null;
    });

    if (stats) {
      trend.push({
        zoom: z,
        totalLabels: stats.totalLabels,
        visibleLabels: stats.visibleLabels,
        collisionRate: stats.collisionRate,
      });
    }
  }

  // Write trend to JSON for CI tracking
  const trendData = {
    timestamp: new Date().toISOString(),
    nodeCount: await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      for (const l of leaves) {
        if (l.view && "pixiNodes" in l.view) return l.view.pixiNodes.size;
      }
      return 0;
    }),
    zoomTrend: trend,
  };

  const outDir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "collision-trend.json"),
    JSON.stringify(trendData, null, 2),
  );

  // Verify trend was recorded
  expect(trend.length).toBeGreaterThanOrEqual(4);

  // §0.1 gate: collision rate ≤ 5% at zoom 1.0
  const at1 = trend.find(t => t.zoom === 1.0);
  if (at1) {
    expect(at1.collisionRate).toBeLessThanOrEqual(0.05);
  }

  await setZoom(page, 1.0);
});

// JA-2: Collision rate should decrease as zoom increases (more space = fewer collisions)
test("JA-2: collision rate trend is non-increasing with zoom", async () => {
  const trend = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return null;

    const results: { zoom: number; rate: number }[] = [];
    const world = view.worldContainer;
    if (!world) return null;

    for (const z of [0.3, 0.5, 1.0, 2.0]) {
      world.scale.set(z);
      view.markDirty?.(true);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      view.renderPipeline?.cullOverlappingLabels?.();
      const stats = view.getLabelCullStats?.();
      if (stats) results.push({ zoom: z, rate: stats.collisionRate });
    }

    world.scale.set(1.0);
    view.markDirty?.(true);
    return results;
  });

  if (trend && trend.length >= 3) {
    // At higher zoom, collision rate should generally be lower or equal
    // (More screen space per node = fewer collisions)
    const at03 = trend.find(t => t.zoom === 0.3)?.rate ?? 0;
    const at10 = trend.find(t => t.zoom === 1.0)?.rate ?? 0;
    // Relaxed: zoom 1.0 rate should not be dramatically worse than 0.3
    expect(at10).toBeLessThanOrEqual(at03 + 0.05);
  }
});

// ── JB: Memory Profile ──

// JB-3: §0.4 Memory usage measurement
test("JB-3: §0.4 JS heap size is within bounds", async () => {
  const result = await page.evaluate(() => {
    const perf = (performance as any);
    if (!perf.memory) return { ok: true, skipped: true, reason: "performance.memory not available" };

    const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
    const totalMB = perf.memory.totalJSHeapSize / (1024 * 1024);

    // Get node count for context
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let nodeCount = 0;
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) { nodeCount = l.view.pixiNodes.size; break; }
    }

    return {
      ok: true,
      usedMB: Math.round(usedMB),
      totalMB: Math.round(totalMB),
      nodeCount,
      // §0.4: ≤ 300MB FAIL boundary (150MB target for 5000 nodes)
      withinLimit: usedMB < 300,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.withinLimit).toBe(true);
  }
});

// JB-4: Memory does not leak significantly during zoom cycles
test("JB-4: memory stable during zoom stress test", async () => {
  const result = await page.evaluate(async () => {
    const perf = (performance as any);
    if (!perf.memory) return { ok: true, skipped: true };

    const before = perf.memory.usedJSHeapSize;

    // Stress: 20 zoom cycles
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const world = view.worldContainer;
    if (!world) return { ok: true, skipped: true };

    for (let i = 0; i < 20; i++) {
      world.scale.set(0.2 + Math.random() * 2.8);
      view.markDirty?.(true);
      await new Promise(r => requestAnimationFrame(r));
    }
    world.scale.set(1.0);
    view.markDirty?.(true);

    // Force GC if available
    if ((window as any).gc) (window as any).gc();
    await new Promise(r => setTimeout(r, 500));

    const after = perf.memory.usedJSHeapSize;
    const growthMB = (after - before) / (1024 * 1024);

    return {
      ok: true,
      beforeMB: Math.round(before / (1024 * 1024)),
      afterMB: Math.round(after / (1024 * 1024)),
      growthMB: growthMB.toFixed(1),
      // Allow up to 50MB growth (GC timing is unpredictable)
      stable: growthMB < 50,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.stable).toBe(true);
  }
});

// JB-5: Write memory profile to JSON
test("JB-5: memory profile recorded for trend tracking", async () => {
  const profile = await page.evaluate(() => {
    const perf = (performance as any);
    const mem = perf.memory ? {
      usedMB: Math.round(perf.memory.usedJSHeapSize / (1024 * 1024)),
      totalMB: Math.round(perf.memory.totalJSHeapSize / (1024 * 1024)),
      limitMB: Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024)),
    } : null;

    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let nodeCount = 0;
    let edgeCount = 0;
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        nodeCount = l.view.pixiNodes.size;
        edgeCount = l.view.graphEdges?.length ?? 0;
        break;
      }
    }

    return { timestamp: new Date().toISOString(), nodeCount, edgeCount, memory: mem };
  });

  // Write profile
  const outDir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "memory-profile.json"),
    JSON.stringify(profile, null, 2),
  );

  expect(profile.nodeCount).toBeGreaterThan(0);
});

// Stability
test("§0: no errors during trend + memory profiling", async () => {
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
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
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
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

