/**
 * CDP E2E Test -- Density-adaptive culling verification
 * Verifies that at zoom-out, labels maintain minimum screen distance.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

test("density culling: minimum label spacing at zoom-out", async () => {
  test.setTimeout(60_000);

  for (const zoom of [0.2, 0.3, 0.5]) {
    const result = await page.evaluate(async (z) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      view.worldContainer.scale.set(z);
      view.updateLabelsForZoom();
      await new Promise(r => setTimeout(r, 1000));

      const pns = view.pixiNodes;
      const ws = view.worldContainer.scale.x;
      const centers: { cx: number; cy: number }[] = [];
      for (const [, pn] of pns) {
        if (!pn.label?.visible || pn.label.alpha < 0.1) continue;
        const cx = (pn.data.x + (pn.label.x ?? 0)) * ws;
        const cy = (pn.data.y + (pn.label.y ?? 0)) * ws;
        centers.push({ cx, cy });
      }

      let minDist = Infinity;
      let closeCount = 0;
      for (let i = 0; i < centers.length; i++)
        for (let j = i + 1; j < centers.length; j++) {
          const d = Math.sqrt((centers[i].cx - centers[j].cx) ** 2 + (centers[i].cy - centers[j].cy) ** 2);
          if (d < minDist) minDist = d;
          if (d < 50) closeCount++;
        }

      return { zoom: z, labels: centers.length, minDist: Math.round(minDist), closePairs: closeCount };
    }, zoom);

    console.log(`[zoom=${zoom}]`, JSON.stringify(result));
    expect(result).not.toHaveProperty("error");

    // At zoom < 0.5, labels should not be extremely close (< 50px)
    if (typeof result === "object" && "closePairs" in result && zoom < 0.5) {
      expect(result.closePairs).toBeLessThanOrEqual(3);
    }
  }
});

test("density culling: more labels at zoom=1 than zoom=0.3", async () => {
  test.setTimeout(30_000);

  const counts: Record<number, number> = {};
  for (const z of [0.3, 1.0]) {
    const result = await page.evaluate(async (zoom) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      view.worldContainer.scale.set(zoom);
      view.updateLabelsForZoom();
      await new Promise(r => setTimeout(r, 500));
      let vis = 0;
      for (const [, pn] of view.pixiNodes) {
        if (pn.label?.visible && pn.label.alpha >= 0.1) vis++;
      }
      return { zoom, vis };
    }, z);
    if ("vis" in result) counts[z] = result.vis;
  }

  expect(counts[1.0]).toBeGreaterThan(counts[0.3] * 5);
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

