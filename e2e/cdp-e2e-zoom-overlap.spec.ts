/**
 * CDP E2E Test -- Zoom overlap measurement at multiple zoom levels
 *
 * IMPORTANT: This test requires a fresh page reload to pick up new plugin code.
 * Obsidian caches require() modules, so disablePlugin/enablePlugin alone
 * does NOT reload the JS bundle.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];

  // Force a full page reload to clear module cache
  const initialPage = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];
  await initialPage.reload({ waitUntil: "load" });
  await initialPage.waitForTimeout(8000);

  // Re-acquire page reference after reload
  const pages = ctx.pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Open graph view
  await page.evaluate(async () => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

test("zoom overlap measurement at 0.3, 0.5, 1.0", async () => {
  test.setTimeout(120_000);
  for (const zoom of [0.3, 0.5, 1.0]) {
    const result = await page.evaluate(async (z) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      const world = view.worldContainer;
      if (!world) return { error: "no worldContainer" };
      world.scale.set(z);

      if (typeof view.updateLabelsForZoom === "function") {
        view.updateLabelsForZoom();
      }
      if (typeof view.markDirty === "function") {
        view.markDirty(true);
      }
      await new Promise(r => setTimeout(r, 2000));

      const pns = view.pixiNodes;
      if (!pns) return { error: "no pixiNodes" };
      const ws = world.scale?.x ?? 1;

      // Count visible labels + measure overlaps
      let visibleLabels = 0, labelOverlaps = 0;
      const labelRects: { x: number; y: number; w: number; h: number }[] = [];
      for (const [, pn] of pns) {
        if (!pn.label?.visible || pn.label.alpha < 0.1) continue;
        visibleLabels++;
        const s = pn.label.scale?.x ?? 1;
        // Screen-space dimensions (world size * zoom)
        const sw = (pn.label.width ?? 50) * s * ws;
        const sh = (pn.label.height ?? 14) * s * ws;
        const anchorX = pn.label.anchor?.x ?? 0;
        const anchorY = pn.label.anchor?.y ?? 0;
        const x = (pn.data.x + (pn.label.x ?? 0)) * ws - sw * anchorX;
        const y = (pn.data.y + (pn.label.y ?? 0)) * ws - sh * anchorY;
        labelRects.push({ x, y, w: sw, h: sh });
      }
      for (let i = 0; i < labelRects.length; i++)
        for (let j = i + 1; j < labelRects.length; j++) {
          const a = labelRects[i], b = labelRects[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
            labelOverlaps++;
        }

      // Node overlaps
      let nodeOverlaps = 0;
      const nodes: { x: number; y: number; r: number }[] = [];
      for (const [, pn] of pns) nodes.push({ x: pn.data.x, y: pn.data.y, r: pn.radius });
      for (let i = 0; i < Math.min(nodes.length, 200); i++)
        for (let j = i + 1; j < Math.min(nodes.length, 200); j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          if (d < (a.r + b.r) * 0.9) nodeOverlaps++;
        }

      return { zoom: ws, visibleLabels, labelOverlaps, nodeOverlaps, totalNodes: pns.size };
    }, zoom);

    console.log(`[zoom=${zoom}]`, JSON.stringify(result));
    expect(result).not.toHaveProperty("error");

    // Assertions: no node overlaps at any zoom
    if (typeof result === "object" && "nodeOverlaps" in result) {
      expect(result.nodeOverlaps).toBe(0);
    }
    // Label overlap thresholds by zoom level
    if (typeof result === "object" && "labelOverlaps" in result) {
      if (zoom >= 1.0) {
        expect(result.labelOverlaps).toBe(0);
      } else if (zoom >= 0.5) {
        expect(result.labelOverlaps).toBeLessThanOrEqual(3);
      } else {
        // At extreme zoom-out, allow some residual overlap
        expect(result.labelOverlaps).toBeLessThanOrEqual(15);
      }
    }
  }

  // === Visual quality: verify display after state change ===
  const _dq = await measureScreenDensity(page);
  if (_dq.totalNodes > 10) {
    expect(_dq.worstCellCount).toBeLessThan(200);
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

