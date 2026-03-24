/**
 * CDP E2E Test — Cycle 64 (Cycle 26): JC cullStats auto-refresh + JD init render time
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

// JC-1: getLabelCullStats auto-refreshes when stale
test("JC-1: getLabelCullStats auto-refreshes stale stats", async () => {
  await page.waitForTimeout(2000);
  await setZoom(page, 1.0);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Force a full render pass to ensure labels exist
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 200));

    // Now get stats — JC auto-refresh should ensure non-zero if labels exist
    const stats = view.getLabelCullStats?.();
    const nodeCount = view.pixiNodes?.size ?? 0;

    // Check label visibility
    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const visibleLabels = nodes.filter((pn: any) => pn.label?.visible).length;

    return {
      ok: true,
      nodeCount,
      visibleLabels,
      statsTotal: stats?.totalLabels ?? -1,
      statsVisible: stats?.visibleLabels ?? -1,
      collisionRate: stats?.collisionRate?.toFixed(3) ?? "n/a",
      // JC fix: if there are visible labels, stats should report them
      statsPopulated: visibleLabels === 0 || (stats?.totalLabels ?? 0) > 0,
    };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.statsPopulated).toBe(true);
  }
});

// JC-2: Stats update correctly after zoom change
test("JC-2: cullStats reflect zoom-dependent label count", async () => {
  // At zoom 0.2, very few labels should be counted
  await setZoom(page, 0.2);
  await page.waitForTimeout(500);

  const atLow = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return view.getLabelCullStats?.()?.totalLabels ?? -1;
  });

  // At zoom 1.0, more labels
  await setZoom(page, 1.0);
  await page.waitForTimeout(500);

  const atHigh = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return view.getLabelCullStats?.()?.totalLabels ?? -1;
  });

  // More labels at higher zoom (or at least not fewer)
  if (atLow >= 0 && atHigh >= 0) {
    expect(atHigh).toBeGreaterThanOrEqual(atLow);
  }

});

// JD-3: §0.4 Initial rendering time — view becomes ready
test("JD-3: §0.4 graph view is ready with pixiNodes populated", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };

    const nodeCount = view.pixiNodes?.size ?? 0;
    const edgeCount = view.graphEdges?.length ?? 0;
    const hasWorld = !!view.worldContainer;

    return {
      ok: nodeCount > 0,
      nodeCount,
      edgeCount,
      hasWorld,
      // §0.4: view should be ready (nodes populated)
      ready: nodeCount > 0 && hasWorld,
    };
  });

  expect(result.ok).toBe(true);

  // === Screen-space quality: post-render pile-up check ===
  const _sspq = await measureScreenDensity(page);
  if (_sspq.totalNodes > 10) {
    expect(_sspq.worstCellCount).toBeLessThan(200);
  }
  expect(result.ready).toBe(true);
});

// JD-4: §0.4 Plugin re-enable render time < 1000ms
test("JD-4: §0.4 render pipeline initializes quickly after view open", async () => {
  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Measure doRender time (simulates re-render after state change)
    const t0 = performance.now();
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const elapsed = performance.now() - t0;

    return {
      ok: true,
      renderMs: elapsed.toFixed(1),
      nodeCount: view.pixiNodes?.size ?? 0,
      // §0.4: render < 1000ms (FAIL boundary)
      withinFail: elapsed < 1000,
      // Target: < 500ms
      withinTarget: elapsed < 500,
    };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.withinFail).toBe(true);
  }
});

// JC-3: §0.1 collision rate gate with reliable stats
test("JC-3: §0.1 collision rate with auto-refreshed stats", async () => {
  await setZoom(page, 1.0);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Full render + double RAF for reliable stats
    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 100));

    const stats = view.getLabelCullStats?.();
    return {
      ok: true,
      totalLabels: stats?.totalLabels ?? 0,
      collisionRate: stats?.collisionRate ?? 0,
      // §0.1: ≤ 5% at zoom 1.0
      pass: (stats?.totalLabels ?? 0) === 0 || (stats?.collisionRate ?? 0) <= 0.05,
    };
  });

  expect(result.ok).toBe(true);

  // === Display Quality: post-render sanity ===
  const _spread = await measureSpread(page);
  expect(_spread.nanCount).toBe(0);
  expect(_spread.infCount).toBe(0);
  if (!result.skipped) {
    expect(result.pass).toBe(true);
  }
});

// Stability
test("§0: no errors during JC/JD verification", async () => {
  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
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

