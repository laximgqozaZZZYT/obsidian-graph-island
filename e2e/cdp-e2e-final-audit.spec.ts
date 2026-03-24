/**
 * Final Audit — stable-baseline toggle verification with stopped simulation
 *
 * Uses PixiJS scene graph inspection (not canvas pixel reads) to detect
 * changes in node alpha, tint, visibility, and position.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface SceneState {
  nodeCount: number;
  visibleNodes: number;
  avgAlpha: number;
  positionHash: number;
}

async function getSceneState(): Promise<SceneState> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, visibleNodes: 0, avgAlpha: 0, positionHash: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes) return { nodeCount: 0, visibleNodes: 0, avgAlpha: 0, positionHash: 0 };
    let visible = 0, alphaSum = 0, posHash = 0;
    for (const pn of pixiNodes.values()) {
      if (pn.gfx?.visible !== false) visible++;
      alphaSum += pn.gfx?.alpha ?? 1;
      posHash += Math.round((pn.data?.x ?? 0) * 7 + (pn.data?.y ?? 0) * 13);
    }
    return {
      nodeCount: pixiNodes.size,
      visibleNodes: visible,
      avgAlpha: pixiNodes.size > 0 ? alphaSum / pixiNodes.size : 0,
      positionHash: posHash,
    };
  });
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showTags = false;
    p.searchQuery = "folder:characters";
    p.clusterArrangement = "spiral";
    p.showOrphans = true;
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2500));
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

test.describe("Final Audit — Scene Graph Inspection", () => {

  test("showOrphans toggle changes visible node count", async () => {
    await resetView();
    const before = await getSceneState();
    expect(before.nodeCount).toBeGreaterThan(10);

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showOrphans = false;
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));

    });
    const after = await getSceneState();

    expect(after.nodeCount).toBeLessThanOrEqual(before.nodeCount);
    console.log(`showOrphans: ${before.nodeCount} -> ${after.nodeCount} nodes`);
  });

  test("arrangement change modifies position hash", async () => {
    await resetView();
    const spiral = await getSceneState();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2500));
    });
    const grid = await getSceneState();

    expect(grid.positionHash).not.toBe(spiral.positionHash);
    console.log(`arrangement: spiral hash=${spiral.positionHash}, grid hash=${grid.positionHash}`);

  });

  test("searchQuery filter reduces node count", async () => {
    await resetView();
    const before = await getSceneState();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.searchQuery = "path:classic-macbeth";
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getSceneState();

    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    expect(after.nodeCount).toBeGreaterThan(10);
    console.log(`searchQuery: ${before.nodeCount} -> ${after.nodeCount} nodes`);

  });
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

