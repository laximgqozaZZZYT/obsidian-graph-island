/**
 * CDP E2E Test -- Card overlap measurement at multiple zoom levels
 * Checks card display mode for visual overlap when zooming out.
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

  // Switch to card mode and open graph view
  await page.evaluate(async () => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));

    // Switch to card display mode
    const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      if (panel) {
        panel.nodeDisplayMode = "card";
        if (typeof view.doRender === "function") view.doRender();
        else if (typeof view.markDirty === "function") view.markDirty(true);
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  });
});

test("card overlap measurement at 0.3, 0.5, 1.0", async () => {
  test.setTimeout(120_000);
  for (const zoom of [0.3, 0.5, 1.0]) {
    const result = await page.evaluate(async (z) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      if (!panel || panel.nodeDisplayMode !== "card") return { error: "not card mode: " + panel?.nodeDisplayMode };

      const world = view.worldContainer;
      if (!world) return { error: "no worldContainer" };
      world.scale.set(z);
      if (typeof view.updateLabelsForZoom === "function") view.updateLabelsForZoom();
      if (typeof view.markDirty === "function") view.markDirty(true);
      await new Promise(r => setTimeout(r, 2000));

      const pns = view.pixiNodes;
      if (!pns) return { error: "no pixiNodes" };
      const ws = world.scale?.x ?? 1;

      // Card dimensions from panel config (counter-scaled)
      const crc = panel.cardRenderConfig ?? {};
      const cardScale = Math.min(1 / ws, 8);
      const headerH = (crc.tableHeaderHeight ?? 18) * cardScale;
      const fieldLineH = (crc.fieldLineHeight ?? 14) * cardScale;
      const fieldCount = (panel.cardDisplayConfig?.fields?.length ?? 0) + 2;
      const totalH = headerH + fieldCount * fieldLineH + (crc.cardPadding ?? 4) * 2 * cardScale;
      const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
      const arHalfW = (totalH * cardAR) / 2;

      // Measure card overlap in screen space
      let cardOverlaps = 0;
      const cardRects: { x: number; y: number; w: number; h: number }[] = [];
      let sampleCount = 0;
      for (const [, pn] of pns) {
        if (sampleCount++ >= 200) break;
        const halfW = Math.max(20 / ws, arHalfW);
        const cardW = halfW * 2;
        // Screen-space rect
        const sx = (pn.data.x - halfW) * ws;
        const sy = (pn.data.y - totalH / 2) * ws;
        const sw = cardW * ws;
        const sh = totalH * ws;
        cardRects.push({ x: sx, y: sy, w: sw, h: sh });
      }
      for (let i = 0; i < cardRects.length; i++)
        for (let j = i + 1; j < cardRects.length; j++) {
          const a = cardRects[i], b = cardRects[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
            cardOverlaps++;
        }

      return {
        zoom: ws,
        cardOverlaps,
        cardCount: cardRects.length,
        cardScale: Math.round(cardScale * 100) / 100,
        cardScreenW: Math.round(arHalfW * 2 * ws),
        cardScreenH: Math.round(totalH * ws),
      };
    }, zoom);

    console.log(`[zoom=${zoom}]`, JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
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

