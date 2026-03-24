/**
 * Comprehensive Audit — verify node/edge counts after multi-setting changes
 *
 * Tests combined filter interactions and validates that pipeline stages
 * compose correctly.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface Snapshot {
  nodeCount: number;
  edgeCount: number;
  tagNodeCount: number;
  orphanCount: number;
}

async function snapDetailed(): Promise<Snapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0, tagNodeCount: 0, orphanCount: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    let tagNodeCount = 0;
    const edgeNodes = new Set<string>();
    for (const e of edges) {
      edgeNodes.add(e.source);
      edgeNodes.add(e.target);
    }
    let orphanCount = 0;
    if (pixiNodes) {
      for (const pn of pixiNodes.values()) {
        if (pn.data?.isTag) tagNodeCount++;
        if (!edgeNodes.has(pn.data?.id)) orphanCount++;
      }
    }
    return {
      nodeCount: pixiNodes?.size ?? 0,
      edgeCount: edges.length,
      tagNodeCount,
      orphanCount,
    };
  });
}

async function applyPanel(settings: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (s: Record<string, unknown>) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") {
        (p as any)[k] = new Set(v as string[]);
      } else {
        (p as any)[k] = v;
      }
    }
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  }, settings);
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

test.describe("Comprehensive Multi-Setting Audit", () => {

  test("baseline state has expected counts", async () => {
    await applyPanel({
      showOrphans: true, showTags: true, showTagNodes: true, showSimilar: false,
      searchQuery: "", groupBy: "none", groupByRules: [], collapsedGroups: [],
    });
    const s = await snapDetailed();
    expect(s.nodeCount).toBeGreaterThanOrEqual(2000);
    expect(s.edgeCount).toBeGreaterThanOrEqual(4000);
    console.log(`baseline: ${s.nodeCount} nodes, ${s.edgeCount} edges, ${s.tagNodeCount} tags, ${s.orphanCount} orphans`);

  });

  test("showTags=false + showOrphans=false compounds reduction", async () => {
    await applyPanel({
      showOrphans: true, showTags: true, showTagNodes: true, showSimilar: false,
      searchQuery: "", groupBy: "none", groupByRules: [], collapsedGroups: [],
    });
    const baseline = await snapDetailed();

    await applyPanel({ showTags: false });
    const noTags = await snapDetailed();
    expect(noTags.nodeCount).toBeLessThan(baseline.nodeCount);

    await applyPanel({ showOrphans: false });
    const noTagsNoOrphans = await snapDetailed();
    expect(noTagsNoOrphans.nodeCount).toBeLessThanOrEqual(noTags.nodeCount);
    console.log(`compound: ${baseline.nodeCount} -> ${noTags.nodeCount} (no tags) -> ${noTagsNoOrphans.nodeCount} (no orphans)`);

  });

  test("searchQuery + showOrphans interaction", async () => {
    await applyPanel({
      showOrphans: true, showTags: true, showTagNodes: true, showSimilar: false,
      searchQuery: "tag:battle", groupBy: "none", groupByRules: [], collapsedGroups: [],
    });
    const withOrphans = await snapDetailed();
    expect(withOrphans.nodeCount).toBeGreaterThan(50);

    await applyPanel({ showOrphans: false });
    const withoutOrphans = await snapDetailed();
    expect(withoutOrphans.nodeCount).toBeLessThanOrEqual(withOrphans.nodeCount);
    console.log(`tag:battle orphan interaction: ${withOrphans.nodeCount} -> ${withoutOrphans.nodeCount}`);

  });

  test("groupBy collapses nodes into super-nodes", async () => {
    await applyPanel({
      showOrphans: true, showTags: false, showTagNodes: false, showSimilar: false,
      searchQuery: "", groupBy: "folder", groupByRules: null, collapsedGroups: [],
    });
    const grouped = await snapDetailed();
    expect(grouped.nodeCount).toBeGreaterThan(0);
    // With auto-collapse, super-nodes reduce visible count
    console.log(`groupBy=folder: ${grouped.nodeCount} nodes, ${grouped.edgeCount} edges`);

  });

  test("showSimilar adds edges without changing node count", async () => {
    await applyPanel({
      showOrphans: true, showTags: false, showTagNodes: false, showSimilar: false,
      searchQuery: "", groupBy: "none", groupByRules: [], collapsedGroups: [],
    });
    const before = await snapDetailed();

    await applyPanel({ showSimilar: true });
    const after = await snapDetailed();
    expect(after.nodeCount).toBe(before.nodeCount);
    expect(after.edgeCount).toBeGreaterThanOrEqual(before.edgeCount);
    console.log(`showSimilar: edges ${before.edgeCount} -> ${after.edgeCount}`);

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

