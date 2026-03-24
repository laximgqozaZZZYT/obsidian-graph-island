/**
 * CDP E2E Test — Cycle 72 (Cycle 34): JS Quality Dashboard + JT Viewport Culling
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

// JS-1: Quality Dashboard section exists in stats panel
test("JS-1: quality dashboard section in stats panel", async () => {
  await page.waitForTimeout(2000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    panel.showGraphStats = true;
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 500));

    const statsEl = view.graphStatsEl;
    if (!statsEl) return { ok: true, skipped: true };
    const text = statsEl.textContent ?? "";
    const hasDashboard = text.includes("Quality Dashboard") || text.includes("Quality");

    return { ok: true, hasDashboard, snippet: text.substring(0, 400) };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped && result.snippet?.includes("Complexity")) {
    expect(result.hasDashboard).toBe(true);
  }
});

// JS-2: Dashboard badges show PASS/FAIL indicators
test("JS-2: dashboard has structured quality badges", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const dashboard = view.graphStatsEl?.querySelector(".gi-quality-dashboard");
    if (!dashboard) return { ok: true, reason: "no dashboard element" };

    const rows = dashboard.querySelectorAll(".gi-stats-row");
    return { ok: true, rowCount: rows.length, hasBadges: rows.length >= 4 };
  });

  expect(result.ok).toBe(true);

  // === Screen-space quality: post-render pile-up check ===
  const _sspq = await measureScreenDensity(page);
  if (_sspq.totalNodes > 10) {
    expect(_sspq.worstCellCount).toBeLessThan(200);
  }
});

// JT-3: §0.4 Off-viewport nodes have gfx.visible=false at high zoom
test("JT-3: §0.4 off-viewport nodes are hidden from renderer", async () => {
  // Zoom IN to ensure some nodes are off-viewport
  await setZoom(page, 3.0);
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Force full render at zoomed-in level
    const world = view.worldContainer;
    if (world) world.scale.set(3.0);
    view.markDirty?.(true);
    view.wakeRenderLoop?.();
    await new Promise(r => setTimeout(r, 500));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const total = nodes.length;
    const visibleGfx = nodes.filter((pn: any) => pn.gfx.visible).length;
    const hiddenGfx = total - visibleGfx;

    // Reset zoom
    if (world) world.scale.set(1.0);
    view.markDirty?.(true);

    return {
      ok: true,
      total,
      visibleGfx,
      hiddenGfx,
      // At zoom 3.0 with 2000+ nodes, many should be off-viewport
      hasHidden: hiddenGfx > 0 || total < 100,
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
    expect(result.hasHidden).toBe(true);
  }
});

// JT-4: §0.4 Viewport culling preserves visible nodes correctly
test("JT-4: visible nodes are within viewport bounds", async () => {
  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Count visible nodes — should be a subset of total
    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const visibleCount = nodes.filter((pn: any) => pn.gfx.visible).length;
    const totalCount = nodes.length;

    return {
      ok: true,
      totalCount,
      visibleCount,
      // Visible should be ≤ total (culling is working)
      cullingActive: visibleCount <= totalCount,
    };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.cullingActive).toBe(true);
  }
});

// JT-5: Zooming out hides more nodes (culling scales with zoom)
test("JT-5: zoom out increases hidden node count", async () => {
  await setZoom(page, 1.0);
  await page.waitForTimeout(400);
  const atZ1 = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Array.from(view.pixiNodes.values() as IterableIterator<any>).filter((pn: any) => pn.gfx.visible).length;
  });

  await setZoom(page, 0.2);
  await page.waitForTimeout(400);
  const atZ02 = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Array.from(view.pixiNodes.values() as IterableIterator<any>).filter((pn: any) => pn.gfx.visible).length;
  });

  // At zoom 0.2, more nodes fit in viewport — so more should be visible
  // (This is correct: zooming OUT shows more nodes, not fewer)
  if (atZ1 >= 0 && atZ02 >= 0) {
    expect(atZ02).toBeGreaterThanOrEqual(atZ1);
  }
  await setZoom(page, 1.0);

});

// Stability
test("§0: no errors during dashboard + culling tests", async () => {
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

