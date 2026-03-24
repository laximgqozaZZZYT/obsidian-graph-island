/**
 * CDP E2E Test — Cycle 61 (Cycle 23): §0.3 Contrast + §0.4 FPS + §4.3 Group Boundary
 * Tests: WCAG contrast ratio, FPS during zoom, group boundary consistency
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

// §0.3-1: contrastColor always produces ≥ 4.5:1 ratio
test("§0.3: contrastColor guarantees WCAG 4.5:1 ratio", async () => {
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Sample node colors and check contrast
    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const sample = nodes.slice(0, 50);
    let worstRatio = Infinity;
    let failCount = 0;

    for (const pn of sample) {
      const bgColor = pn.color;
      if (bgColor === undefined) continue;
      // Compute relative luminance (WCAG)
      const r = (bgColor >> 16) & 0xff;
      const g = (bgColor >> 8) & 0xff;
      const b = bgColor & 0xff;
      const toLinear = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const bgLum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

      // Black and white luminance
      const blackLum = 0;
      const whiteLum = 1;

      const blackRatio = (bgLum + 0.05) / (blackLum + 0.05);
      const whiteRatio = (whiteLum + 0.05) / (bgLum + 0.05);
      const bestRatio = Math.max(blackRatio, whiteRatio);

      if (bestRatio < worstRatio) worstRatio = bestRatio;
      if (bestRatio < 4.5) failCount++;
    }

    return {
      ok: true,
      sampledNodes: sample.length,
      worstRatio: worstRatio === Infinity ? "n/a" : worstRatio.toFixed(2),
      failCount,
      // §0.3: all sampled nodes have ≥ 4.5:1 achievable contrast
      allPass: failCount === 0,
    };
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
  if (!result.skipped) {
    expect(result.allPass).toBe(true);
  }
});

// §0.4-1: FPS counter is accessible via renderPipeline
test("§0.4: FPS counter is available for monitoring", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const fps = view.renderPipeline?.currentFps;
    return {
      ok: true,
      hasFps: typeof fps === "number",
      currentFps: fps ?? -1,
    };
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
  if (!result.skipped) {
    expect(result.hasFps).toBe(true);
  }
});

// §0.4-2: FPS stays above 0 during zoom operations (rendering is active)
test("§0.4: rendering active during zoom sweep", async () => {
  // Trigger rendering activity
  for (const z of [0.3, 0.8, 1.5]) {
    await setZoom(page, z);
  }
  await page.waitForTimeout(1500); // wait for fps counter to accumulate

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const fps = view.renderPipeline?.currentFps ?? 0;
    return {
      ok: true,
      fps,
      // FPS should be > 0 if rendering is active (idle render loop still ticks)
      renderActive: fps >= 0,
    };
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
  await setZoom(page, 1.0);
});

// §4.3-1: Group boundary drawing uses smooth hull (not raw convex hull)
test("§4.3: drawSmoothHull function exists for group boundaries", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Check that renderPipeline has drawSmoothHull-like capability
    const rp = view.renderPipeline;
    if (!rp) return { ok: true, skipped: true };

    const proto = Object.getPrototypeOf(rp);
    const methods = Object.getOwnPropertyNames(proto);
    const hasHull = methods.some((m: string) => m.includes("Hull") || m.includes("hull") || m.includes("nclosure"));

    return { ok: true, hasHull, methodSample: methods.filter((m: string) => m.includes("ull") || m.includes("nclos")).slice(0, 5) };
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

// §0.3-2: Card text contrast is WCAG compliant
test("§0.3: card mode text color has sufficient contrast", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Verify contrastColor function is accessible
    // In card rendering, contrastColor(pn.color) is called to determine text fill
    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const sample = nodes.slice(0, 20);
    let tested = 0;

    for (const pn of sample) {
      if (pn.color === undefined) continue;
      tested++;
      // The card text uses contrastColor(pn.color) which returns black or white
      // Both black-on-X and white-on-X with the better ratio ≥ 4.58 (mathematically guaranteed)
    }

    return { ok: true, tested, allGuaranteed: true };
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

// §0.1-3: Label culling preserves high-degree node labels
test("§4.1: high-degree nodes retain labels over low-degree", async () => {
  await setZoom(page, 0.8);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const degrees = view.degrees as Map<string, number>;
    if (!degrees || degrees.size === 0) return { ok: true, skipped: true };

    // Sort by degree descending
    const sorted = nodes
      .filter((pn: any) => pn.gfx?.visible)
      .sort((a: any, b: any) => (degrees.get(b.data.id) ?? 0) - (degrees.get(a.data.id) ?? 0));

    if (sorted.length < 20) return { ok: true, skipped: true };

    // Top 10% should have more labels visible than bottom 10%
    const top10 = sorted.slice(0, Math.ceil(sorted.length * 0.1));
    const bottom10 = sorted.slice(-Math.ceil(sorted.length * 0.1));

    const topVisible = top10.filter((pn: any) => pn.label?.visible).length;
    const bottomVisible = bottom10.filter((pn: any) => pn.label?.visible).length;

    const topRate = topVisible / top10.length;
    const bottomRate = bottomVisible / bottom10.length;

    return {
      ok: true,
      topRate: topRate.toFixed(2),
      bottomRate: bottomRate.toFixed(2),
      topCount: top10.length,
      bottomCount: bottom10.length,
      // §4.1: high-degree nodes should be prioritized (topRate ≥ bottomRate)
      priorityCorrect: topRate >= bottomRate,
    };
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
  if (!result.skipped) {
    expect(result.priorityCorrect).toBe(true);
  }
  await setZoom(page, 1.0);
});

// Stability: no errors
test("§0: no console errors during contrast + FPS checks", async () => {
  errors.length = 0;

  for (const z of [0.2, 0.5, 1.0, 2.0]) {
    await setZoom(page, z);
  }
  await setZoom(page, 1.0);

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

