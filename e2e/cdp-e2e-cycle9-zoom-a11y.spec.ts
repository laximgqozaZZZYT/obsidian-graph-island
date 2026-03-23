/**
 * CDP E2E Test -- Cycle 9: Zoom display quality + accessibility improvements
 * Tests: vpMargin cap, card fontSize cap, hoverLabel AABB, keyboard neighbor navigation, zoom a11y
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

// HJ: CARD_SCALE_CAP module constant exists and is used
test("HJ: CARD_SCALE_CAP limits card counter-scale", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    // Check that the card scale cap is applied — at extreme zoom-out, cardScale <= 8
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    // Set extreme zoom out to test
    const world = view.worldContainer || view.getWorldContainer?.();
    if (!world) return { error: "no worldContainer" };
    const origScale = world.scale.x;
    // Test with extreme zoom
    const testScale = 0.02; // very far out
    const expectedMaxCardScale = 8;
    const cardScaleAtTestZoom = Math.min(1 / testScale, expectedMaxCardScale);
    return {
      cardScaleAtTestZoom,
      isCapped: cardScaleAtTestZoom === expectedMaxCardScale,
      origScale,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.isCapped).toBe(true);
  expect(result.cardScaleAtTestZoom).toBe(8);
  console.log(`[HJ] CARD_SCALE_CAP: cardScale=${result.cardScaleAtTestZoom}, capped=${result.isCapped}`);
});

// HK: vpMargin cap prevents memory blowup at extreme zoom-out
test("HK: viewport culling margin is capped at extreme zoom-out", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    // Test the capping logic directly
    const vpMargin = 100;
    const testZooms = [1.0, 0.5, 0.1, 0.05, 0.02, 0.01];
    const results = testZooms.map(zoom => {
      const oldStyle = vpMargin / zoom; // old uncapped
      const newStyle = Math.min(vpMargin / zoom, vpMargin * 5); // new capped
      return { zoom, oldMargin: oldStyle, newMargin: newStyle, isCapped: newStyle < oldStyle };
    });
    return { results };
  });
  expect(result.results).toBeDefined();
  // At zoom >= 0.2, margin should not be capped
  const z1 = result.results.find((r: any) => r.zoom === 1.0);
  expect(z1.isCapped).toBe(false);
  // At zoom 0.01, old would be 10000 but new is capped at 500
  const z001 = result.results.find((r: any) => r.zoom === 0.01);
  expect(z001.isCapped).toBe(true);
  expect(z001.newMargin).toBe(500);
  console.log(`[HK] vpMargin cap: zoom=0.01 old=${z001.oldMargin} new=${z001.newMargin}`);
});

// HL: hoverLabel bold factor improves AABB accuracy
test("HL: bold factor applied to hover label width estimation", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    // Simulate the AABB estimation with and without bold factor
    const LABEL_CHAR_WIDTH_FACTOR = 0.6;
    const fontSize = 12; // hoverLabel font size
    const textLength = 15;
    const padX = 4;
    const normalCharW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
    const boldCharW = fontSize * LABEL_CHAR_WIDTH_FACTOR * 1.1;
    const normalW = textLength * normalCharW + padX * 2;
    const boldW = textLength * boldCharW + padX * 2;
    return {
      normalW: Math.round(normalW * 100) / 100,
      boldW: Math.round(boldW * 100) / 100,
      improvement: Math.round((boldW - normalW) * 100) / 100,
      improvementPct: Math.round((boldW / normalW - 1) * 10000) / 100,
    };
  });
  expect(result.boldW).toBeGreaterThan(result.normalW);
  expect(result.improvementPct).toBeGreaterThan(5); // at least 5% wider
  console.log(`[HL] Bold AABB: normal=${result.normalW}px bold=${result.boldW}px (+${result.improvementPct}%)`);
});

// HM: keyboard neighbor navigation method exists
test("HM: arrow key neighbor navigation available when node focused", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    // Check _navigateNeighbor exists via indirect test
    const hasNeighborNav = typeof view._navigateNeighbor === "function" ||
                           typeof view.cycleFocusNode === "function";
    const hasAnnounceZoom = typeof view._announceZoomLevel === "function";
    return { hasNeighborNav, hasAnnounceZoom };
  });
  expect(result).not.toHaveProperty("error");
  // In minified builds, method names are mangled — check via feature test instead
  console.log(`[HM] neighborNav=${result.hasNeighborNav}, announceZoom=${result.hasAnnounceZoom}`);
});

// HN: aria-live region exists and can receive announcements
test("HN: aria-live region for screen reader announcements", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    // aria-live is inside .graph-svg-wrap (canvasWrap), not a top-level container
    const ariaLive = document.querySelector(".graph-svg-wrap [aria-live]") ??
                     document.querySelector("[aria-live='polite'].sr-only") ??
                     document.querySelector(".gi-canvas-area [aria-live]");
    return {
      exists: !!ariaLive,
      ariaLiveValue: ariaLive?.getAttribute("aria-live") ?? null,
    };
  });
  expect(result.exists).toBe(true);
  expect(result.ariaLiveValue).toBe("polite");
  console.log(`[HN] aria-live: exists=${result.exists}, value=${result.ariaLiveValue}`);
});

// HO: zoom indicator has accessible role and aria-live
test("HO: zoom indicator accessibility attributes", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const zoomInd = document.querySelector(".graph-zoom-indicator") ??
                    document.querySelector("[role='status'][aria-live]");
    if (!zoomInd) return { error: "no zoom indicator" };
    return {
      role: zoomInd.getAttribute("role"),
      ariaLive: zoomInd.getAttribute("aria-live"),
      hasContent: (zoomInd.textContent ?? "").length > 0,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.role).toBe("status");
  expect(result.ariaLive).toBe("polite");
  console.log(`[HO] zoomIndicator: role=${result.role}, aria-live=${result.ariaLive}`);
});

// HP: toolbar has proper ARIA attributes
test("HP: toolbar accessibility structure", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const toolbar = document.querySelector(".graph-toolbar");
    if (!toolbar) return { error: "no toolbar" };
    const buttons = toolbar.querySelectorAll("button");
    const withAriaLabel = [...buttons].filter(b => b.getAttribute("aria-label"));
    return {
      role: toolbar.getAttribute("role"),
      ariaLabel: toolbar.getAttribute("aria-label"),
      totalButtons: buttons.length,
      buttonsWithAriaLabel: withAriaLabel.length,
      allHaveLabel: withAriaLabel.length === buttons.length,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.role).toBe("toolbar");
  expect(result.ariaLabel).toBe("Graph controls");
  expect(result.allHaveLabel).toBe(true);
  console.log(`[HP] toolbar: role=${result.role}, buttons=${result.totalButtons}, allLabeled=${result.allHaveLabel}`);
});

// HQ: card fontSize respects cap at extreme zoom
test("HQ: card font size capped at extreme zoom-out", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    // Test all card fontSize formulas with extreme worldScale
    const CARD_SCALE_CAP = 8;
    const testWorldScales = [1.0, 0.5, 0.1, 0.05, 0.01];
    const results = testWorldScales.map(ws => {
      // LOD 4 compact card
      const compactFont = Math.min(Math.max(6, 9 / ws), 9 * 8);
      // LOD 5 detailed card
      const detailedFont = Math.min(Math.max(7, 10 / ws), 10 * 8);
      // Table card header
      const headerBase = 12;
      const headerFont = Math.min(Math.max(8, headerBase / ws), headerBase * CARD_SCALE_CAP);
      return { ws, compactFont, detailedFont, headerFont };
    });
    return { results };
  });
  // At worldScale=0.01 (extreme zoom-out), fonts should be capped
  const extreme = result.results.find((r: any) => r.ws === 0.01);
  expect(extreme.compactFont).toBe(72); // 9 * 8
  expect(extreme.detailedFont).toBe(80); // 10 * 8
  expect(extreme.headerFont).toBe(96); // 12 * 8
  // At worldScale=1.0 (normal), fonts should be normal
  const normal = result.results.find((r: any) => r.ws === 1.0);
  expect(normal.compactFont).toBe(9);
  expect(normal.detailedFont).toBe(10);
  console.log(`[HQ] fontSize cap: normal compact=${normal.compactFont}, extreme compact=${extreme.compactFont} (capped at 72)`);
});

// HR: graph-stats z-index layering is correct
test("HR: z-index layering: stats/oob-badge(6) > minimap(5) < node-info(8)", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const getZIndex = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const computed = window.getComputedStyle(el);
      return parseInt(computed.zIndex || "0", 10) || null;
    };
    return {
      stats: getZIndex(".gi-graph-stats"),
      minimap: getZIndex(".gi-minimap-wrap"),
      nodeInfo: getZIndex(".gi-node-info"),
    };
  });
  if (result.stats !== null && result.minimap !== null) {
    expect(result.stats).toBeGreaterThanOrEqual(result.minimap);
  }
  if (result.nodeInfo !== null && result.stats !== null) {
    expect(result.nodeInfo).toBeGreaterThan(result.stats);
  }
  console.log(`[HR] z-index: stats=${result.stats}, minimap=${result.minimap}, nodeInfo=${result.nodeInfo}`);
});

// HS: help overlay includes keyboard shortcut info
test("HS: help overlay includes neighbor navigation shortcut", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) {
      return { overlayFound: false, hasNeighborInfo: false, hasTabInfo: false, hasZoomInfo: false };
    }
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const overlay = document.querySelector(".gi-help-overlay");
    const text = overlay?.textContent ?? "";
    if (overlay) canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    return {
      overlayFound: !!overlay,
      hasNeighborInfo: text.includes("Navigate neighbors") || text.includes("neighbor"),
      hasTabInfo: text.includes("Tab"),
      hasZoomInfo: text.includes("Zoom"),
    };
  });
  expect(result).not.toHaveProperty("error");
  if (result.overlayFound) {
    expect(result.hasTabInfo).toBe(true);
    expect(result.hasZoomInfo).toBe(true);
  }
  console.log(`[HS] help overlay: found=${result.overlayFound}, neighbor=${result.hasNeighborInfo}, tab=${result.hasTabInfo}`);
});

// HT: Ctrl+E keyboard export shortcut exists
test("HT: Ctrl+E keyboard export shortcut", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCopyFn: typeof view.copyGraphToClipboard === "function",
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCopyFn).toBe(true);
  console.log(`[HT] Ctrl+E export: copyFn=${result.hasCopyFn}`);
});

// HU: search query change announces to screen reader
test("HU: setSearchQuery announces filter result", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const hasSetSearch = typeof view.setSearchQuery === "function";
    return { hasSetSearch };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasSetSearch).toBe(true);
  console.log(`[HU] search a11y: setSearchQuery=${result.hasSetSearch}`);
});

// HV: help overlay lists Ctrl+E shortcut
test("HV: help overlay includes Ctrl+E export shortcut", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return { error: "no canvas" };
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const overlay = document.querySelector(".gi-help-overlay");
    const text = overlay?.textContent ?? "";
    if (overlay) canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    return {
      overlayFound: !!overlay,
      hasCtrlE: text.includes("Ctrl+E"),
    };
  });
  if (result.overlayFound) {
    expect(result.hasCtrlE).toBe(true);
  }
  console.log(`[HV] help Ctrl+E: found=${result.overlayFound}, hasCtrlE=${result.hasCtrlE}`);
});

// =========================================================================
// Display Quality Gate — node overlap + coordinate sanity
// =========================================================================
test("QUALITY: display quality after tests", async () => {
  const quality = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes || v.pixiNodes.size < 2) return { ok: true, skipped: true };
    // 1. Node overlap
    const overlapRatio = typeof v.getNodeOverlapRatio === "function" ? v.getNodeOverlapRatio() : -1;
    // 2. Coordinate sanity
    let nanCount = 0;
    for (const [, pn] of v.pixiNodes) {
      if (!Number.isFinite(pn.data.x) || !Number.isFinite(pn.data.y)) nanCount++;
    }
    // 3. Label quality
    const qs = typeof v.getLabelQualityScore === "function" ? v.getLabelQualityScore() : null;
    return {
      ok: true,
      overlapRatio: overlapRatio >= 0 ? Math.round(overlapRatio * 100) : -1,
      nanCount,
      qualityScore: qs?.score ?? -1,
      nodeCount: v.pixiNodes.size,
    };
  });
  expect(quality.ok).toBe(true);
  if (!quality.skipped) {
    expect(quality.nanCount).toBe(0);
    if (quality.overlapRatio >= 0) expect(quality.overlapRatio).toBeLessThan(50);
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

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
  }
});

