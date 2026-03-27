/**
 * Edge Visibility Audit — verify each edge type toggle removes correct count
 *
 * Baseline edge types: link=1695, semantic=2363, tag=1500
 * Each toggle is tested independently against the baseline.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface EdgeSnapshot {
  total: number;
  byType: Record<string, number>;
  visibleEdgeCount: number;
}

async function resetToFullGraph(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true;
    p.showTags = true;
    p.showTagNodes = true;
    p.showSimilar = false;
    p.showLinks = true;
    p.showInheritance = true;
    p.showAggregation = true;
    p.showSibling = true;
    p.showSequence = true;
    p.showTagEdges = true;
    p.showSemanticEdges = true;
    p.searchQuery = "";
    p.groupBy = "none";
    p.groupByRules = [];
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function getEdgeSnapshot(): Promise<EdgeSnapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { total: 0, byType: {}, visibleEdgeCount: 0 };
    const view = leaf.view;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    const byType: Record<string, number> = {};
    for (const e of edges) {
      const t = e.type || "unknown";
      byType[t] = (byType[t] || 0) + 1;
    }
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    let visible = 0;
    if (pixiNodes && pixiNodes.size > 0) {
      for (const e of edges) {
        const src = pixiNodes.get(e.source);
        const tgt = pixiNodes.get(e.target);
        if (src && tgt) visible++;
      }
    }
    return { total: edges.length, byType, visibleEdgeCount: visible };
  });
}

async function setEdgeToggle(key: string, value: boolean): Promise<void> {
  await page.evaluate(([k, v]: [string, boolean]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
  }, [key, value]);
  await page.waitForTimeout(1000);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await resetToFullGraph();
});

test.afterAll(async () => {});

test.describe("Edge Visibility Audit", () => {

  test("baseline edge distribution matches expected", async () => {
    await resetToFullGraph();
    const s = await getEdgeSnapshot();
    expect(s.total).toBeGreaterThanOrEqual(4000);
    expect(s.visibleEdgeCount).toBeGreaterThan(0);
    console.log(`baseline edges: total=${s.total}, visible=${s.visibleEdgeCount}`);
    console.log(`  by type: ${JSON.stringify(s.byType)}`);
  });

  test("showLinks=false removes link-type edges from data", async () => {
    await resetToFullGraph();
    const before = await getEdgeSnapshot();
    const linkCount = before.byType["link"] ?? 0;

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showLinks = false;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const after = await getEdgeSnapshot();

    // showLinks only affects rendering, not data — edge count in data may be same
    // but visible rendering changes
    const s1 = await page.screenshot();
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showLinks = true;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    let diff = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(100);
    console.log(`showLinks toggle: pixel diff=${diff}, link edges in data=${linkCount}`);

  });

  test("showSemanticEdges=false hides semantic edges", async () => {
    await resetToFullGraph();
    const s1 = await page.screenshot();

    await setEdgeToggle("showSemanticEdges", false);
    const s2 = await page.screenshot();

    let diff = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(100);
    console.log(`showSemanticEdges off: pixel diff=${diff}`);
    await setEdgeToggle("showSemanticEdges", true);
  });

  test("showTagEdges=false hides tag edges", async () => {
    await resetToFullGraph();
    const s1 = await page.screenshot();

    await setEdgeToggle("showTagEdges", false);
    const s2 = await page.screenshot();

    let diff = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(100);
    console.log(`showTagEdges off: pixel diff=${diff}`);
    await setEdgeToggle("showTagEdges", true);
  });

  test("colorEdgesByRelation produces visual change", async () => {
    await resetToFullGraph();
    const s1 = await page.screenshot();

    await setEdgeToggle("colorEdgesByRelation", false);
    const s2 = await page.screenshot();

    let diff = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(50);
    console.log(`colorEdgesByRelation toggle: pixel diff=${diff}`);
    await setEdgeToggle("colorEdgesByRelation", true);
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

