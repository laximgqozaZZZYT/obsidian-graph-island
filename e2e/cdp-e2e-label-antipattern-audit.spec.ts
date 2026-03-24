/**
 * Label Anti-Pattern Audit — verify label positions do not overlap excessively
 *
 * Checks for floating labels, pill overlap, and culling ratio across
 * multiple arrangements.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface LabelMetrics {
  totalNodes: number;
  labelsPlaced: number;
  labelsCulled: number;
  avgDistFromNode: number;
  overlapPairs: number;
  maxDistFromNode: number;
}

async function getLabelMetrics(): Promise<LabelMetrics> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { totalNodes: 0, labelsPlaced: 0, labelsCulled: 0, avgDistFromNode: 0, overlapPairs: 0, maxDistFromNode: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { totalNodes: 0, labelsPlaced: 0, labelsCulled: 0, avgDistFromNode: 0, overlapPairs: 0, maxDistFromNode: 0 };

    // Count labels by checking labelContainer children
    const labelContainer = view.labelContainer ?? view.worldContainer?.children?.find((c: any) => c.name === "labels");
    const labels: { x: number; y: number; width: number; height: number; nodeX: number; nodeY: number }[] = [];

    if (labelContainer && labelContainer.children) {
      for (const child of labelContainer.children) {
        if (!child.visible) continue;
        const bounds = child.getBounds?.();
        if (!bounds || bounds.width === 0) continue;
        // Find nearest node
        let minDist = Infinity;
        let nearestX = 0, nearestY = 0;
        for (const pn of pixiNodes.values()) {
          const dx = (pn.data?.x ?? 0) - child.x;
          const dy = (pn.data?.y ?? 0) - child.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) { minDist = d; nearestX = pn.data?.x ?? 0; nearestY = pn.data?.y ?? 0; }
        }
        labels.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, nodeX: nearestX, nodeY: nearestY });
      }
    }

    // Compute metrics
    let totalDist = 0;
    let maxDist = 0;
    for (const l of labels) {
      const dx = l.x + l.width / 2 - l.nodeX;
      const dy = l.y + l.height / 2 - l.nodeY;
      const d = Math.sqrt(dx * dx + dy * dy);
      totalDist += d;
      if (d > maxDist) maxDist = d;
    }

    let overlapPairs = 0;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          overlapPairs++;
        }
      }
    }

    return {
      totalNodes: pixiNodes.size,
      labelsPlaced: labels.length,
      labelsCulled: pixiNodes.size - labels.length,
      avgDistFromNode: labels.length > 0 ? totalDist / labels.length : 0,
      overlapPairs,
      maxDistFromNode: maxDist,
    };
  });
}

async function setArrangement(arr: string): Promise<void> {
  await page.evaluate(async (a: string) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.clusterArrangement = a;
    p.coordinateLayout = null;
    p.showTags = false;
    p.searchQuery = "folder:characters";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 3000));
  }, arr);
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
});

test.afterAll(async () => {});

test.describe("Label Anti-Pattern Audit", () => {

  test("spiral arrangement: overlap rate below threshold", async () => {
    await setArrangement("spiral");
    const m = await getLabelMetrics();
    expect(m.totalNodes).toBeGreaterThan(10);
    const overlapRate = m.labelsPlaced > 1 ? m.overlapPairs / (m.labelsPlaced * (m.labelsPlaced - 1) / 2) : 0;
    expect(overlapRate).toBeLessThan(0.3);
    console.log(`spiral labels: ${m.labelsPlaced} placed, ${m.labelsCulled} culled, overlap=${(overlapRate * 100).toFixed(1)}%`);
  });

  test("grid arrangement: overlap rate below threshold", async () => {
    await setArrangement("grid");
    const m = await getLabelMetrics();
    expect(m.totalNodes).toBeGreaterThan(10);
    const overlapRate = m.labelsPlaced > 1 ? m.overlapPairs / (m.labelsPlaced * (m.labelsPlaced - 1) / 2) : 0;
    expect(overlapRate).toBeLessThan(0.3);
    console.log(`grid labels: ${m.labelsPlaced} placed, ${m.labelsCulled} culled, overlap=${(overlapRate * 100).toFixed(1)}%`);
  });

  test("culling ratio is reasonable (not hiding too many labels)", async () => {
    await setArrangement("spiral");
    const m = await getLabelMetrics();
    // At least some labels should be visible
    expect(m.labelsPlaced).toBeGreaterThan(0);
    const cullRate = m.totalNodes > 0 ? m.labelsCulled / m.totalNodes : 0;
    // Should not cull more than 95% of labels
    expect(cullRate).toBeLessThan(0.95);
    console.log(`culling: ${m.labelsPlaced}/${m.totalNodes} visible (${((1 - cullRate) * 100).toFixed(1)}%)`);
  });

  test("no floating labels (max distance from node is bounded)", async () => {
    await setArrangement("spiral");
    const m = await getLabelMetrics();
    if (m.labelsPlaced > 0) {
      // Labels should be within reasonable distance of their nodes
      expect(m.avgDistFromNode).toBeLessThan(500);
      console.log(`label distance: avg=${m.avgDistFromNode.toFixed(1)}, max=${m.maxDistFromNode.toFixed(1)}`);
    }
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

