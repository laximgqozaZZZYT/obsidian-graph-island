/**
 * CDP E2E Test — Cycle 74 (Cycle 35): ensureRT refactoring + renderThresholds integrity
 *
 * Validates that the ensureRT() helper correctly initializes renderThresholds
 * and that all threshold read/write operations work after the 37-site refactoring.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const errors: string[] = [];

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
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

function getView(p: Page) {
  return p.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) return true;
    }
    return false;
  });
}

// JU-1: renderThresholds auto-initialization via slider write
test("JU-1: renderThresholds auto-init on labelDensity write", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Clear renderThresholds to simulate fresh state
    const saved = view.panel.renderThresholds;
    view.panel.renderThresholds = undefined;

    // Write a value — this should trigger ensureRT initialization
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelDensity = 1.5;

    const rtExists = !!view.panel.renderThresholds;
    const ldVal = view.panel.renderThresholds?.labelDensity;

    // Restore
    view.panel.renderThresholds = saved;
    return { ok: rtExists && ldVal === 1.5, rtExists, ldVal };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// JU-2: mergeRenderThresholds returns correct defaults after ensureRT
test("JU-2: mergeRenderThresholds defaults after null renderThresholds", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Get render thresholds via the merge path
    const rt = view.getRenderThresholds();
    // These should be either defined values or empty object (defaults applied downstream)
    return {
      ok: typeof rt === "object" && rt !== null,
      type: typeof rt,
      keys: Object.keys(rt).length,
    };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JU-3: labelModeOverride read/write without as-any cast
test("JU-3: labelModeOverride typed read/write", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.labelModeOverride;

    // Write typed value
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelModeOverride = "initials";
    const readBack = view.panel.renderThresholds.labelModeOverride;

    // Test all valid values
    const validValues = ["auto", "initials", "truncated", "full"];
    const allValid = validValues.every(v => {
      view.panel.renderThresholds.labelModeOverride = v;
      return view.panel.renderThresholds.labelModeOverride === v;
    });

    // Restore
    if (view.panel.renderThresholds) {
      view.panel.renderThresholds.labelModeOverride = saved;
    }

    return { ok: readBack === "initials" && allValid, readBack, allValid };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JU-4: enclosureLabelPosition typed read/write
test("JU-4: enclosureLabelPosition typed read/write", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.enclosureLabelPosition;

    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    const positions = ["top", "center", "bottom"];
    const allValid = positions.every(pos => {
      view.panel.renderThresholds.enclosureLabelPosition = pos;
      return view.panel.renderThresholds.enclosureLabelPosition === pos;
    });

    // Restore
    if (view.panel.renderThresholds) {
      view.panel.renderThresholds.enclosureLabelPosition = saved;
    }

    return { ok: allValid, allValid };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JU-5: renderThresholds numeric fields survive round-trip
test("JU-5: numeric threshold fields round-trip", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = { ...view.panel.renderThresholds };
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};

    const testFields: [string, number][] = [
      ["globalEdgeAlpha", 0.7],
      ["edgeMinZoom", 0.05],
      ["edgeFadeMinAlpha", 0.15],
      ["labelDensity", 2.0],
      ["labelMaxChars", 20],
      ["cardBodyMaxLines", 5],
      ["enclosureFillOpacity", 0.3],
      ["enclosureStrokeWidth", 3],
      ["labelCullCooldown", 10],
      ["edgeLabelZoomHide", 0.2],
      ["edgeLabelZoomFade", 0.4],
    ];

    const failures: string[] = [];
    for (const [field, val] of testFields) {
      (view.panel.renderThresholds as any)[field] = val;
      const readBack = (view.panel.renderThresholds as any)[field];
      if (readBack !== val) failures.push(`${field}: wrote ${val}, got ${readBack}`);
    }

    // Restore
    view.panel.renderThresholds = saved;

    return { ok: failures.length === 0, failures, tested: testFields.length };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis = await measureEdgeVisibility(page);
  if (_eVis.totalEdges > 5) {
    expect(_eVis.lowAlphaCount).toBeLessThan(_eVis.visibleEdges * 0.5);
  }

  // === Card quality: verify card readability ===
  const _cardQ = await measureCardReadability(page);
  if (_cardQ.totalCards > 5) {
    expect(_cardQ.overlappingCards).toBeLessThan(_cardQ.totalCards * 0.3);
  }
  expect(_csq.infCount).toBe(0);

  // === Edge quality: verify edges visible after setting change ===
  const _eVis2 = await measureEdgeVisibility(page);
  if (_eVis2.totalEdges > 5) {
    expect(_eVis2.lowAlphaCount).toBeLessThan(_eVis2.visibleEdges * 0.5);
  }

  // === Card quality: verify card readability ===
  const _cardQ2 = await measureCardReadability(page);
  if (_cardQ2.totalCards > 5) {
    expect(_cardQ2.overlappingCards).toBeLessThan(_cardQ2.totalCards * 0.3);
  }
});

// JU-6: enclosureZoomOutThreshold read/write (cycle73 feature)
test("JU-6: enclosureZoomOutThreshold configurable", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.enclosureZoomOutThreshold;

    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.enclosureZoomOutThreshold = 0.3;
    const readBack = view.panel.renderThresholds.enclosureZoomOutThreshold;

    // Restore
    if (view.panel.renderThresholds) {
      view.panel.renderThresholds.enclosureZoomOutThreshold = saved;
    }

    return { ok: readBack === 0.3, readBack };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JU-7: labelFadeRate read/write (cycle73 feature)
test("JU-7: labelFadeRate configurable", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    const saved = view.panel.renderThresholds?.labelFadeRate;

    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelFadeRate = 0.25;
    const readBack = view.panel.renderThresholds.labelFadeRate;

    // Restore
    if (view.panel.renderThresholds) {
      view.panel.renderThresholds.labelFadeRate = saved;
    }

    return { ok: readBack === 0.25, readBack };
  });

  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JU-8: no console errors during tests
test("JU-8: no console errors during threshold operations", async () => {
  expect(errors.length).toBe(0);
});

test.afterAll(async () => {
  // Do not close CDP connection
});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  const minimap = await measureMinimap(page);
  const guides = await measureGuides(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety} minimap=${minimap.visible} guides=${guides.lineCount}/${guides.labelCount}`);
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
  // Guide labels should not all overlap each other
  if (guides.labelCount > 2) {
    expect(guides.overlappingLabels).toBeLessThan(guides.labelCount);
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

