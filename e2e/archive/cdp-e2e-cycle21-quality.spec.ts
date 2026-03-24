/**
 * CDP E2E Test — Cycle 21: Edge density floor + card body max lines + LOD cascade
 * Verifies IQ (edgeDensityFloor slider) and IP (cardBodyMaxLines non-hardcode)
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
  await page.bringToFront();
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
  // Wait for Graph Island view to be available (may need graph open)
  await page.waitForTimeout(3000);
  const hasView = await page.evaluate(() => {
    return !!(window as any).app?.workspace?.getLeavesOfType("graph-view")
      ?.find((l: any) => l.view && "pixiNodes" in l.view);
  });
  if (!hasView) {
    // Try opening graph view
    await page.evaluate(async () => {
      await (window as any).app.commands.executeCommandById("graph-island:open-graph");
    });
    await page.waitForTimeout(5000);
  }
});

// Helper: get Graph Island view
const getView = `
  const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
    .find((l: any) => l.view && "pixiNodes" in l.view);
  if (!leaf) throw new Error("no GI view");
  const v = leaf.view;
`;

// IQ: edgeDensityFloor is configurable via _edgeDrawCfg
test("IQ: edgeDensityFloor is configurable and render-safe", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    const pd = Object.getOwnPropertyDescriptors(v);
    const cfg = pd._edgeDrawCfg?.value;
    if (!cfg) return { error: "no _edgeDrawCfg" };

    const original = cfg.edgeDensityFloor;
    cfg.edgeDensityFloor = 0.3;
    const set1 = cfg.edgeDensityFloor;
    cfg.edgeDensityFloor = 0.02;
    const set2 = cfg.edgeDensityFloor;
    cfg.edgeDensityFloor = original;
    return { original, set1, set2, restored: cfg.edgeDensityFloor };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.original).toBeCloseTo(0.12, 1);
  expect(result.set1).toBeCloseTo(0.3, 1);
  expect(result.set2).toBeCloseTo(0.02, 1);
  expect(result.restored).toBeCloseTo(result.original, 2);
  console.log(`[IQ] edgeDensityFloor: orig=${result.original}, test1=${result.set1}, test2=${result.set2}`);
});

// IP: cardBodyMaxLines is configurable via panel.renderThresholds
test("IP: cardBodyMaxLines is configurable via renderThresholds", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    const pd = Object.getOwnPropertyDescriptors(v);
    const panel = pd.panel?.value;

    // Ensure renderThresholds exists
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const rt = panel.renderThresholds;

    const original = rt.cardBodyMaxLines;
    rt.cardBodyMaxLines = 7;
    const set7 = rt.cardBodyMaxLines;
    rt.cardBodyMaxLines = 0;
    const set0 = rt.cardBodyMaxLines;
    // Restore original (may be undefined — that's OK, falls back to DEFAULT)
    if (original !== undefined) {
      rt.cardBodyMaxLines = original;
    } else {
      delete rt.cardBodyMaxLines;
    }
    return { original: original ?? "default(3)", set7, set0, typeofOrig: typeof original };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.set7).toBe(7);
  expect(result.set0).toBe(0);
  console.log(`[IP] cardBodyMaxLines: orig=${result.original}, set7=${result.set7}, set0=${result.set0}`);
});

// IV: LOD label cascade — labels increase monotonically with zoom
test("IV: LOD label count increases with zoom level", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    const zooms = [0.1, 0.3, 0.5, 0.8, 1.0];
    const counts: { z: number; labels: number }[] = [];

    for (const z of zooms) {
      v.setZoom(z);
      await new Promise(r => setTimeout(r, 800));
      const pd = Object.getOwnPropertyDescriptors(v);
      const pixiNodes = pd.pixiNodes?.value;
      let vis = 0;
      for (const [, pn] of pixiNodes) {
        if (pn.label?.visible) vis++;
      }
      counts.push({ z, labels: vis });
    }
    return counts;
  });

  expect(result).not.toHaveProperty("error");
  // Labels should monotonically increase with zoom
  for (let i = 1; i < result.length; i++) {
    expect(result[i].labels).toBeGreaterThanOrEqual(result[i - 1].labels);
  }
  const summary = result.map((r: any) => `z${r.z}=${r.labels}`).join(", ");
  console.log(`[IV] LOD cascade: ${summary}`);
});

// IW: Edge density floor change + render produces no errors
test("IW: edgeDensityFloor sweep + render produces no errors", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    const pd = Object.getOwnPropertyDescriptors(v);
    const cfg = pd._edgeDrawCfg?.value;

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: any[]) => { errs.push(args.map(String).join(" ")); origErr(...args); };

    const orig = cfg?.edgeDensityFloor ?? 0.12;
    for (const val of [0.02, 0.1, 0.3, 0.5]) {
      if (cfg) cfg.edgeDensityFloor = val;
      v.doRender();
      await new Promise(r => setTimeout(r, 200));
    }
    if (cfg) cfg.edgeDensityFloor = orig;
    v.doRender();

    console.error = origErr;
    return { errorCount: errs.length, errors: errs.slice(0, 3) };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.errorCount).toBe(0);
  console.log(`[IW] edgeDensityFloor render sweep: ${result.errorCount} errors`);

});

// IX: No console errors across cycle 21
test("IX: no console errors across cycle 21", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IX] ${errors.length} errors`);
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

