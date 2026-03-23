/**
 * Pipeline Audit — quality metrics for layout patterns
 *
 * Tests node overlap ratio, node spread, and pattern-specific shape validation
 * across multiple arrangement presets.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface NodeInfo { id: string; x: number; y: number; radius: number; }

interface PatternMetrics {
  nodeCount: number;
  overlapRatio: number;
  spread: { width: number; height: number };
  avgRadius: number;
  minGap: number;
}

async function getPatternMetrics(): Promise<PatternMetrics> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, overlapRatio: 0, spread: { width: 0, height: 0 }, avgRadius: 0, minGap: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { nodeCount: 0, overlapRatio: 0, spread: { width: 0, height: 0 }, avgRadius: 0, minGap: 0 };

    const nodes: { x: number; y: number; r: number }[] = [];
    let radiusSum = 0;
    for (const pn of pixiNodes.values()) {
      const x = pn.data?.x ?? 0;
      const y = pn.data?.y ?? 0;
      const r = pn.radius ?? 4;
      nodes.push({ x, y, r });
      radiusSum += r;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    // Sample overlap and min gap (full O(n^2) too slow for >2000 nodes)
    let overlapCount = 0;
    let samplePairs = 0;
    let minGap = Infinity;
    const step = Math.max(1, Math.floor(nodes.length / 200));
    for (let i = 0; i < nodes.length; i += step) {
      for (let j = i + step; j < nodes.length; j += step) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sumR = nodes[i].r + nodes[j].r;
        if (dist < sumR * 0.6) overlapCount++;
        const gap = dist - sumR;
        if (gap < minGap) minGap = gap;
        samplePairs++;
      }
    }

    return {
      nodeCount: nodes.length,
      overlapRatio: samplePairs > 0 ? overlapCount / samplePairs : 0,
      spread: { width: maxX - minX, height: maxY - minY },
      avgRadius: nodes.length > 0 ? radiusSum / nodes.length : 0,
      minGap: isFinite(minGap) ? minGap : 0,
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
    p.searchQuery = "";
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

test.describe("Pipeline Audit — Pattern Quality", () => {

  test("spiral: low overlap, positive spread", async () => {
    await setArrangement("spiral");
    const m = await getPatternMetrics();
    expect(m.nodeCount).toBeGreaterThan(500);
    expect(m.spread.width).toBeGreaterThan(100);
    expect(m.spread.height).toBeGreaterThan(100);
    expect(m.overlapRatio).toBeLessThan(0.3);
    console.log(`spiral: ${m.nodeCount} nodes, overlap=${(m.overlapRatio * 100).toFixed(1)}%, ${m.spread.width.toFixed(0)}x${m.spread.height.toFixed(0)}`);
  });

  test("grid: balanced aspect ratio", async () => {
    await setArrangement("grid");
    const m = await getPatternMetrics();
    expect(m.nodeCount).toBeGreaterThan(500);
    const ratio = m.spread.width > 0 && m.spread.height > 0
      ? Math.max(m.spread.width, m.spread.height) / Math.min(m.spread.width, m.spread.height)
      : Infinity;
    expect(ratio).toBeLessThan(10);
    console.log(`grid: ${m.nodeCount} nodes, aspect=${ratio.toFixed(2)}, overlap=${(m.overlapRatio * 100).toFixed(1)}%`);
  });

  test("concentric: radial distribution", async () => {
    await setArrangement("concentric");
    const m = await getPatternMetrics();
    expect(m.nodeCount).toBeGreaterThan(500);
    expect(m.spread.width).toBeGreaterThan(50);
    expect(m.spread.height).toBeGreaterThan(50);
    console.log(`concentric: ${m.nodeCount} nodes, ${m.spread.width.toFixed(0)}x${m.spread.height.toFixed(0)}`);
  });

  test("phyllotaxis: nodes distributed in sunflower pattern", async () => {
    await setArrangement("phyllotaxis");
    const m = await getPatternMetrics();
    expect(m.nodeCount).toBeGreaterThan(500);
    expect(m.spread.width).toBeGreaterThan(50);
    expect(m.spread.height).toBeGreaterThan(50);
    expect(m.overlapRatio).toBeLessThan(0.5);
    console.log(`phyllotaxis: ${m.nodeCount} nodes, overlap=${(m.overlapRatio * 100).toFixed(1)}%`);
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
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
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
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

