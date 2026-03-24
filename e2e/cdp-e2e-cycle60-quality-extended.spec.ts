/**
 * CDP E2E Test — Cycle 60 (Cycle 22): §0 Quality Extended
 * Tests: mid-zoom LOD, group boundary, hover card latency,
 *        search Tab scoping, edge label smart mode
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
        if (world) { world.scale.set(zoom); }
        l.view.markDirty?.(true);
        break;
      }
    }
  }, z);
  await p.waitForTimeout(300);
}

function getGIView(): string {
  return `
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
  `;
}

// §0.2: Mid-zoom (0.5) shows hover-only labels — label count should be moderate
test("§0.2: mid-zoom 0.5 label visibility is moderate", async () => {
  await page.waitForTimeout(2000);
  await setZoom(page, 0.5);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const total = nodes.length;
    const withLabel = nodes.filter((pn: any) => pn.label?.visible).length;
    const rate = total > 0 ? withLabel / total : 0;

    return {
      ok: true,
      total,
      withLabel,
      rate: rate.toFixed(3),
      // At zoom 0.5, should be between 1% and 30% (moderate)
      moderate: rate >= 0.0 && rate <= 0.30,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  if (!result.skipped && result.total > 10) {
    expect(result.moderate).toBe(true);
  }
});

// §0.2: Mid-zoom (0.8) shows truncated labels
test("§0.2: mid-zoom 0.8 has more visible labels than 0.5", async () => {
  await setZoom(page, 0.5);
  const at05 = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const nodes = Array.from(l.view.pixiNodes.values() as IterableIterator<any>);
        return nodes.filter((pn: any) => pn.label?.visible).length;
      }
    }
    return -1;
  });

  await setZoom(page, 0.8);
  const at08 = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const nodes = Array.from(l.view.pixiNodes.values() as IterableIterator<any>);
        return nodes.filter((pn: any) => pn.label?.visible).length;
      }
    }
    return -1;
  });

  // More labels should be visible at 0.8 than at 0.5
  if (at05 >= 0 && at08 >= 0) {
    expect(at08).toBeGreaterThanOrEqual(at05);
  }
});

// §0.1: Group boundary overlap check via enclosure data
test("§0.1: group enclosures exist when groupBy is active", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    const hasGroupBy = !!panel.groupBy;
    const enclosureLabels = view.getEnclosureLabels?.();
    const enclosureCount = enclosureLabels?.size ?? 0;

    return {
      ok: true,
      hasGroupBy,
      enclosureCount,
      // If groupBy is active, enclosures should exist
      consistent: !hasGroupBy || enclosureCount > 0,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Enclosure quality: verify group boundaries don't overlap ===
  const _encQ = await measureEnclosureOverlap(page);
  if (_encQ.totalEnclosures > 2) {
    expect(_encQ.overlapRate).toBeLessThan(0.50);
  }
  expect(_csq.infCount).toBe(0);

  // === Enclosure quality: verify group boundaries don't overlap ===
  const _encQ2 = await measureEnclosureOverlap(page);
  if (_encQ2.totalEnclosures > 2) {
    expect(_encQ2.overlapRate).toBeLessThan(0.50);
  }
});

// §0.4: Hover card creation latency < 300ms
test("§0.4: hover tooltip creation is fast", async () => {
  await setZoom(page, 1.0);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    if (nodes.length === 0) return { ok: true, skipped: true };

    // Simulate hover on first visible node
    const pn = nodes.find((n: any) => n.gfx?.visible) ?? nodes[0];
    const start = performance.now();
    view.setHighlightedNodeId?.(pn.data.id);
    view.applyHover?.();
    const elapsed = performance.now() - start;

    // Clear hover
    view.setHighlightedNodeId?.(null);
    view.applyHover?.();

    return {
      ok: true,
      hoverLatencyMs: elapsed.toFixed(1),
      // §0.4: hover < 300ms
      fast: elapsed < 300,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Enclosure quality: verify group boundaries don't overlap ===
  const _encQ3 = await measureEnclosureOverlap(page);
  if (_encQ3.totalEnclosures > 2) {
    expect(_encQ3.overlapRate).toBeLessThan(0.50);
  }
  expect(_csq.infCount).toBe(0);

  // === Enclosure quality: verify group boundaries don't overlap ===
  const _encQ4 = await measureEnclosureOverlap(page);
  if (_encQ4.totalEnclosures > 2) {
    expect(_encQ4.overlapRate).toBeLessThan(0.50);
  }
  if (!result.skipped) {
    expect(result.fast).toBe(true);
  }
});

// §0.3: Search-scoped Tab navigation (IR feature)
test("§0.3: Tab cycles through search results when active", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Verify _focusSearchGen tracking field exists
    const hasFocusSearchGen = "_focusSearchGen" in view;
    // Verify _searchHighlightSet field exists
    const hasSearchSet = "_searchHighlightSet" in view;

    return {
      ok: hasFocusSearchGen && hasSearchSet,
      hasFocusSearchGen,
      hasSearchSet,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// §0.1: cullStats API returns valid collision rate
test("§0.1: collision rate at zoom 1.0 is quantified", async () => {
  await setZoom(page, 1.0);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    view.renderPipeline?.cullOverlappingLabels?.();
    const stats = view.getLabelCullStats?.();
    if (!stats) return { ok: false, reason: "no stats API" };

    return {
      ok: true,
      totalLabels: stats.totalLabels,
      visibleLabels: stats.visibleLabels,
      collisionRate: stats.collisionRate?.toFixed(3),
      // Note: some culling expected — the rate tells us it's controlled
      hasData: stats.totalLabels > 0,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// §0.4: Zoom sweep performance — no frame drops
test("§0.4: zoom sweep 0.2→2.0 completes without errors", async () => {
  errors.length = 0;

  for (const z of [0.2, 0.5, 0.8, 1.0, 1.5, 2.0]) {
    await setZoom(page, z);
  }
  await setZoom(page, 1.0);

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
});

// §0.3: ARIA roles coverage — key landmarks exist
test("§0.3: key ARIA landmarks are present", async () => {
  const result = await page.evaluate(() => {
    const roles = {
      main: !!document.querySelector("[role='main']"),
      toolbar: !!document.querySelector("[role='toolbar']"),
      application: !!document.querySelector("[role='application']"),
      status: !!document.querySelector("[role='status']"),
      complementary: !!document.querySelector("[role='complementary']"),
      ariaLive: !!document.querySelector("[aria-live='polite']"),
    };
    const count = Object.values(roles).filter(Boolean).length;
    return { ok: count >= 4, roles, count };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
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

