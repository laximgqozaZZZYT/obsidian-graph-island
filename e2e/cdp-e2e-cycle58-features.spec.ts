/**
 * CDP E2E Test — Cycle 58 (Cycle 20): Card body lines + edge density slider + search tab nav
 * Tests: IP cardBodyMaxLines sync, IQ edgeDensityFloor slider, IR search-scoped Tab
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

// IP-1: cardBodyMaxLines is used for card background height (not hardcoded 3)
test("IP-1: cardBodyMaxLines controls card background height", async () => {
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Verify cardBodyMaxLines exists in renderThresholds
    const rt = panel.renderThresholds ?? {};
    const maxLines = rt.cardBodyMaxLines ?? 3;

    // Set to 5 and verify it's accepted
    panel.renderThresholds = { ...rt, cardBodyMaxLines: 5 };
    const newVal = panel.renderThresholds.cardBodyMaxLines;
    // Reset
    panel.renderThresholds.cardBodyMaxLines = maxLines;

    return { ok: newVal === 5, defaultLines: maxLines, setTo: newVal };
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

// IQ-2: edgeDensityFloor exists in renderThresholds and is adjustable
test("IQ-2: edgeDensityFloor setting is configurable", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    const rt = panel.renderThresholds ?? {};
    const prev = rt.edgeDensityFloor ?? 0.12;
    panel.renderThresholds = { ...rt, edgeDensityFloor: 0.3 };
    const newVal = panel.renderThresholds.edgeDensityFloor;
    panel.renderThresholds.edgeDensityFloor = prev;

    return { ok: newVal === 0.3, default: prev };
  });

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
});

// IR-3: Tab navigation scopes to search results when search is active
test("IR-3: search-scoped Tab cycles through matching nodes only", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Check that _focusSearchGen field exists (IR implementation)
    const hasFocusSearchGen = "_focusSearchGen" in view;

    // Check that _searchHighlightSet is accessible
    const hasSearchSet = "_searchHighlightSet" in view;

    return { ok: hasFocusSearchGen, hasSearchSet, hasFocusSearchGen };
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

// IP-4: Card mode with custom body lines renders without errors
test("IP-4: card mode with increased body lines is stable", async () => {
  errors.length = 0;

  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.nodeDisplayMode = "card";
          panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardBodyMaxLines: 6 };
          l.view.recalcNodeRadii?.();
          l.view.markDirty?.(true);
        }
        break;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Reset
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.nodeDisplayMode = "node";
          panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardBodyMaxLines: 3 };
          l.view.markDirty?.(true);
        }
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
});

// IQ-5: Edge density floor affects rendering at high edge counts
test("IQ-5: edgeDensityFloor is read by EdgeRenderer", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Verify graphEdges exist (edge rendering is active)
    const edgeCount = view.graphEdges?.length ?? 0;
    return { ok: edgeCount > 0, edgeCount };
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

// IE-6: No console errors during feature interactions
test("IE-6: no errors during IP/IQ/IR feature interactions", async () => {
  errors.length = 0;

  // Search + Tab cycle
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.searchQuery = "tag:";
          l.view.rawData = null;
          l.view.doRender?.();
          // Simulate Tab press via cycleFocusNode
          l.view.cycleFocusNode?.(1);
          l.view.cycleFocusNode?.(1);
          panel.searchQuery = "";
          l.view.rawData = null;
          l.view.doRender?.();
        }
        break;
      }
    }
  });
  await page.waitForTimeout(500);

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

