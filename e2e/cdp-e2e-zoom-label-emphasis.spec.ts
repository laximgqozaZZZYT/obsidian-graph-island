/**
 * CDP E2E Test -- Zoom-out label emphasis verification
 * Verifies that labels get enhanced background at low zoom for readability.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const initialPage = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];
  await initialPage.reload({ waitUntil: "load" });
  await initialPage.waitForTimeout(8000);
  const pages = ctx.pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.evaluate(async () => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

test("labels have enhanced bgAlpha at zoom-out", async () => {
  test.setTimeout(60_000);

  // Measure bgAlpha at zoom=1.0
  const atZoom1 = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(1.0);
    view.updateLabelsForZoom();
    await new Promise(r => setTimeout(r, 500));
    const pns = view.pixiNodes;
    const alphas: number[] = [];
    for (const [, pn] of pns) {
      if (pn.label?.visible && pn.label.bgAlpha != null) {
        alphas.push(pn.label.bgAlpha);
        if (alphas.length >= 20) break;
      }
    }
    return { avgBgAlpha: alphas.reduce((a, b) => a + b, 0) / alphas.length, count: alphas.length };
  });

  // Measure bgAlpha at zoom=0.3
  const atZoom03 = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(0.3);
    view.updateLabelsForZoom();
    await new Promise(r => setTimeout(r, 500));
    const pns = view.pixiNodes;
    const alphas: number[] = [];
    const paddings: number[] = [];
    for (const [, pn] of pns) {
      if (pn.label?.visible && pn.label.bgAlpha != null) {
        alphas.push(pn.label.bgAlpha);
        if (pn.label.bgPadX != null) paddings.push(pn.label.bgPadX);
        if (alphas.length >= 20) break;
      }
    }
    return {
      avgBgAlpha: alphas.reduce((a, b) => a + b, 0) / alphas.length,
      avgPadX: paddings.length > 0 ? paddings.reduce((a, b) => a + b, 0) / paddings.length : 0,
      count: alphas.length,
    };
  });

  console.log("zoom=1.0:", JSON.stringify(atZoom1));
  console.log("zoom=0.3:", JSON.stringify(atZoom03));

  expect(atZoom1).not.toHaveProperty("error");
  expect(atZoom03).not.toHaveProperty("error");

  // At zoom=0.3, bgAlpha should be higher than at zoom=1.0
  if ("avgBgAlpha" in atZoom1 && "avgBgAlpha" in atZoom03) {
    expect(atZoom03.avgBgAlpha).toBeGreaterThan(atZoom1.avgBgAlpha);
  }

  // Reset
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (view) { view.worldContainer.scale.set(1); view.updateLabelsForZoom(); }
  });
});

test("zoom indicator shows label count at zoom-out", async () => {
  test.setTimeout(30_000);

  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(0.3);
    view.updateLabelsForZoom();
    if (typeof view.updateZoomIndicator === "function") view.updateZoomIndicator(0.3);
    await new Promise(r => setTimeout(r, 500));

    // Find zoom indicator element
    const el = view.containerEl?.querySelector?.(".gi-zoom-indicator");
    return {
      text: el?.textContent ?? "not found",
      hasLabelCount: el?.textContent?.includes("L") ?? false,
    };
  });

  console.log("zoom indicator:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.hasLabelCount).toBe(true);

  // Reset
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (view) { view.worldContainer.scale.set(1); view.updateLabelsForZoom(); view.updateZoomIndicator(1); }
  });
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
    expect(density.worstCellCount).toBeLessThan(300);
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
    expect(density.worstCellCount).toBeLessThan(300);
    expect(density.viewportUtilization).toBeGreaterThan(2);
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
    expect(overlap.overlapRatio).toBeLessThan(0.50);
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
    expect(density.worstCellCount).toBeLessThan(300);
    expect(density.viewportUtilization).toBeGreaterThan(2);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

});

