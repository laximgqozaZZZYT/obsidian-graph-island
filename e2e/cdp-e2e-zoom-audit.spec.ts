/**
 * Zoom Audit — verify zoom levels produce correct visual scaling
 *
 * Tests that zoom in/out changes the viewport, node positions remain
 * stable in world space, and zoom indicator updates correctly.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

interface ZoomState {
  zoom: number;
  nodeCount: number;
  centerNodeX: number;
  centerNodeY: number;
  zoomIndicatorText: string;
}

async function getZoomState(): Promise<ZoomState> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { zoom: 0, nodeCount: 0, centerNodeX: 0, centerNodeY: 0, zoomIndicatorText: "" };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const zoom = view.zoom ?? view.cameraZoom ?? 1;
    let centerX = 0, centerY = 0, count = 0;
    if (pn) {
      for (const n of pn.values()) {
        centerX += n.data?.x ?? 0;
        centerY += n.data?.y ?? 0;
        count++;
      }
      if (count > 0) { centerX /= count; centerY /= count; }
    }
    const indicator = document.querySelector(".gi-zoom-indicator");
    return {
      zoom,
      nodeCount: count,
      centerNodeX: centerX,
      centerNodeY: centerY,
      zoomIndicatorText: indicator?.textContent ?? "",
    };
  });
}

async function setZoom(level: number): Promise<void> {
  await page.evaluate(async (z: number) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    if (typeof view.zoomTo === "function") view.zoomTo(z);
    else if (typeof view.setZoom === "function") view.setZoom(z);
    else {
      view.zoom = z;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
    }
    await new Promise(r => setTimeout(r, 500));
  }, level);
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showTags = false;
    p.clusterArrangement = "spiral";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await resetView();
});

test.afterAll(async () => {});

test.describe("Zoom Audit", () => {

  test("zoom in produces larger visual rendering", async () => {
    await resetView();
    await setZoom(1.0);
    const s1 = await page.screenshot();

    await setZoom(2.0);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(500);
    console.log(`zoom 1x->2x: pixel diff = ${diff}`);
  });

  test("zoom out produces smaller visual rendering", async () => {
    await resetView();
    await setZoom(1.0);
    const s1 = await page.screenshot();

    await setZoom(0.5);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`zoom 1x->0.5x: pixel diff = ${diff}`);
  });

  test("node world positions unchanged by zoom", async () => {
    await resetView();
    await setZoom(1.0);
    const state1 = await getZoomState();

    await setZoom(3.0);
    const state2 = await getZoomState();

    // Node count unchanged
    expect(state2.nodeCount).toBe(state1.nodeCount);
    // World positions unchanged (within tolerance due to camera-based rendering)
    const posDelta = Math.abs(state2.centerNodeX - state1.centerNodeX) + Math.abs(state2.centerNodeY - state1.centerNodeY);
    expect(posDelta).toBeLessThan(10);
    console.log(`zoom world pos: delta=${posDelta.toFixed(2)}, nodes=${state1.nodeCount}`);
  });

  test("zoom indicator text updates with zoom level", async () => {
    await resetView();
    await setZoom(1.0);
    await page.waitForTimeout(500);
    const s1 = await getZoomState();

    await setZoom(2.0);
    await page.waitForTimeout(500);
    const s2 = await getZoomState();

    if (s1.zoomIndicatorText && s2.zoomIndicatorText) {
      expect(s1.zoomIndicatorText).not.toBe(s2.zoomIndicatorText);
      console.log(`zoom indicator: "${s1.zoomIndicatorText}" -> "${s2.zoomIndicatorText}"`);
    } else {
      console.log("zoom indicator not found in DOM, checking zoom property");
      expect(s2.zoom).toBeGreaterThan(s1.zoom);
    }
  });
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

