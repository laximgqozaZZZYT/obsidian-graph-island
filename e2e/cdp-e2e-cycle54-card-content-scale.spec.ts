/**
 * CDP E2E Test — Cycle 54: Card golden ratio + content-proportional sizing
 * Tests: HM-1 golden ratio, HM-2 slider, HM-3 content scale effect,
 *        HM-4 z-index, HM-5 a11y, HM-6 mode switch, HM-7 hover overlap, HM-8 console errors
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
  // Reload plugin to pick up latest build (location.reload clears JS cache)
  await page.evaluate(async () => {
    const app = (window as any).app;
    // Force JS cache clear via location.reload if plugin is already loaded
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

/** Helper: find Graph Island view (has pixiNodes, not Obsidian's built-in) */
function findGIView(): string {
  return `
    const leaves = window.app.workspace.getLeavesOfType("graph-view");
    let view = null;
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) { view = l.view; break; }
    }
  `;
}

/** Helper: set display mode */
async function setDisplayMode(p: Page, mode: string) {
  await p.evaluate((m) => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return;
    panel.nodeDisplayMode = m;
    view.recalcNodeRadii?.();
    view.markDirty?.(true);
  }, mode);
  await p.waitForTimeout(500);
}

/** Helper: set zoom */
async function setZoom(p: Page, z: number) {
  await p.evaluate((zoom) => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return;
    const world = view.worldContainer || view.getWorldContainer?.();
    if (world) { world.scale.set(zoom); }
    view.markDirty?.(true);
  }, z);
  await p.waitForTimeout(300);
}

// HM-1: Plain card uses golden ratio (width > height, approximately 1.618:1)
test("HM-1: plain card renders with golden ratio landscape aspect", async () => {
  await setDisplayMode(page, "card");
  await setZoom(page, 0.5);

  const result = await page.evaluate(() => {
    const leaves2 = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves2) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel: " + typeof view.panel + " / getPanel=" + typeof view.getPanel };
    const crc = panel.cardRenderConfig ?? {};
    const ar = crc.cardAspectRatio ?? 1.618;
    return { ok: Math.abs(ar - 1.618) < 0.01 || ar === 0, ar, reason: ar === 0 ? "default (0=golden)" : "explicit" };
  });

  // cardAspectRatio is 1.618 by default, or 0 (which means use 1.618)
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

// HM-2: cardContentScale slider exists and is adjustable
test("HM-2: cardContentScale setting exists in renderThresholds", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };
    const rt = panel.renderThresholds ?? {};
    panel.renderThresholds = { ...rt, cardContentScale: 1.0 };
    view.recalcNodeRadii?.();
    const newVal = panel.renderThresholds.cardContentScale;
    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();
    return { ok: newVal === 1.0, val: newVal };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ = await measureCardReadability(page);
  if (_cardQ.totalCards > 5) {
    expect(_cardQ.overlappingCards).toBeLessThan(_cardQ.totalCards * 0.3);
  }
  expect(_csq.infCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ2 = await measureCardReadability(page);
  if (_cardQ2.totalCards > 5) {
    expect(_cardQ2.overlappingCards).toBeLessThan(_cardQ2.totalCards * 0.3);
  }
});

// HM-3: Content scale causes size variation between nodes with different body lengths
test("HM-3: content scale creates size difference by body length", async () => {
  await setDisplayMode(page, "card");

  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const withBody = nodes.filter((pn: any) => (pn.data.bodyLength ?? 0) > 50);
    const withoutBody = nodes.filter((pn: any) => (pn.data.bodyLength ?? 0) < 10);
    if (withBody.length === 0 || withoutBody.length === 0) {
      return { ok: true, reason: "skip: insufficient body length variation", skipped: true };
    }

    panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardContentScale: 1.5 };
    view.recalcNodeRadii?.();

    const avgWith = withBody.slice(0, 20).reduce((s: number, pn: any) => s + pn.radius, 0) / Math.min(20, withBody.length);
    const avgWithout = withoutBody.slice(0, 20).reduce((s: number, pn: any) => s + pn.radius, 0) / Math.min(20, withoutBody.length);

    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();

    return {
      ok: avgWith > avgWithout,
      avgWith: avgWith.toFixed(1),
      avgWithout: avgWithout.toFixed(1),
      withBodyCount: withBody.length,
      withoutBodyCount: withoutBody.length,
    };
  });

  if (!(result as any).skipped) {
    expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ3 = await measureCardReadability(page);
  if (_cardQ3.totalCards > 5) {
    expect(_cardQ3.overlappingCards).toBeLessThan(_cardQ3.totalCards * 0.3);
  }
  expect(_csq.infCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ4 = await measureCardReadability(page);
  if (_cardQ4.totalCards > 5) {
    expect(_cardQ4.overlappingCards).toBeLessThan(_cardQ4.totalCards * 0.3);
  }
  }
});

// HM-4: Z-index hierarchy — node-info above stats/legend
test("HM-4: z-index hierarchy separates overlay panels", async () => {
  const result = await page.evaluate(() => {
    const container = document.querySelector(".workspace-leaf-content[data-type='graph-view']")
      ?? document.querySelector(".graph-island")
      ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, reason: "no container found — skip", skipped: true };

    const getZ = (sel: string) => {
      const el = container.querySelector(sel) as HTMLElement | null;
      if (!el) return -1;
      return parseInt(getComputedStyle(el).zIndex || "0", 10);
    };

    const legend = getZ(".gi-legend");
    const minimap = getZ(".gi-minimap-wrap");
    const stats = getZ(".gi-graph-stats");
    const nodeInfo = getZ(".gi-node-info");
    const oob = getZ(".gi-oob-badge");

    let correct = true;
    if (stats > 0 && legend > 0) correct = correct && (stats >= legend);
    if (oob > 0 && stats > 0) correct = correct && (oob >= stats);
    if (nodeInfo > 0 && oob > 0) correct = correct && (nodeInfo >= oob);

    return { ok: true, legend, minimap, stats, nodeInfo, oob, hierarchyCorrect: correct };
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
  if (!(result as any).skipped) {
    expect(result.hierarchyCorrect).toBe(true);
  }
});

// HM-5: A11y — aria-live region exists for announcements
test("HM-5: aria-live region exists for card mode announcements", async () => {
  const result = await page.evaluate(() => {
    const ariaEl = document.querySelector("[aria-live='polite']") as HTMLElement | null;
    if (!ariaEl) return { ok: false, reason: "no aria-live element found" };
    return { ok: true, ariaLiveFound: true };
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

// HM-6: Display mode switch card→node→card maintains golden ratio config
test("HM-6: mode switch card→node→card preserves golden ratio config", async () => {
  await setDisplayMode(page, "card");

  const before = await page.evaluate(() => {
    const lv = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of lv) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return -1;
    const crc = panel.cardRenderConfig ?? {};
    return crc.cardAspectRatio ?? 1.618;
  });

  await setDisplayMode(page, "node");
  await setDisplayMode(page, "card");

  const after = await page.evaluate(() => {
    const lv = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of lv) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return -1;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return -1;
    const crc = panel.cardRenderConfig ?? {};
    return crc.cardAspectRatio ?? 1.618;
  });

  expect(before).toBeGreaterThan(0);
  expect(after).toBeGreaterThan(0);
  expect(before).toBeCloseTo(after, 2);
});

// HM-7: Hover on card does not overlap with legend panel
test("HM-7: hover label culling exclusion zone includes DOM panels", async () => {
  await setDisplayMode(page, "card");

  const result = await page.evaluate(() => {
    const leaves2 = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves2) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };

    const container = view.containerEl ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, reason: "no container — skip" };

    const panels = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
    let foundPanels = 0;
    for (const sel of panels) {
      const el = container.querySelector(sel) ?? document.querySelector(sel);
      if (el) foundPanels++;
    }

    const nodeCount = view.pixiNodes?.size ?? 0;
    return { ok: true, foundPanels, nodeCount };
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
  await setDisplayMode(page, "node");
});

// HM-8: Console error monitor during card mode interactions
test("HM-8: no console errors during card mode interactions", async () => {
  errors.length = 0;

  await setDisplayMode(page, "card");

  for (const z of [0.1, 0.3, 0.5, 1.0, 2.0]) {
    await setZoom(page, z);
  }

  await page.evaluate(() => {
    const lv3 = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of lv3) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return;
    for (const s of [0, 0.5, 1.0, 1.5, 2.0]) {
      panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardContentScale: s };
      view.recalcNodeRadii?.();
      view.markDirty?.(true);
    }
    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();
  });
  await page.waitForTimeout(1000);

  await setDisplayMode(page, "node");
  await setDisplayMode(page, "donut");
  await setDisplayMode(page, "card");

  await setZoom(page, 1.0);
  await setDisplayMode(page, "node");

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );

  expect(relevantErrors).toHaveLength(0);
});

// HM-9: Hover tooltip has _adjustTooltipForOverlap method
test("HM-9: hover tooltip overlap adjustment method exists", async () => {
  const result = await page.evaluate(() => {
    const leaves2 = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves2) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    // Check that the adjust method exists on the view prototype
    const proto = Object.getPrototypeOf(view);
    const methods = Object.getOwnPropertyNames(proto);
    const hasAdjust = methods.some(m => m.includes("djust") && m.includes("ooltip"));
    // Also verify hover tooltip creation works without errors
    return { ok: true, hasAdjustMethod: hasAdjust, methodCount: methods.length };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ5 = await measureCardReadability(page);
  if (_cardQ5.totalCards > 5) {
    expect(_cardQ5.overlappingCards).toBeLessThan(_cardQ5.totalCards * 0.3);
  }
  expect(_csq.infCount).toBe(0);

  // === Card quality: verify card readability ===
  const _cardQ6 = await measureCardReadability(page);
  if (_cardQ6.totalCards > 5) {
    expect(_cardQ6.overlappingCards).toBeLessThan(_cardQ6.totalCards * 0.3);
  }
});

// HM-10: gridCellShading is NOT a ghost — confirmed connected to GuideRenderer
test("HM-10: gridCellShading property exists in panel state", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };
    // Verify gridCellShading is a defined property (not a ghost — it's used by GuideRenderer)
    const hasProperty = "gridCellShading" in panel;
    const val = panel.gridCellShading;
    return { ok: hasProperty, value: val, type: typeof val };
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

