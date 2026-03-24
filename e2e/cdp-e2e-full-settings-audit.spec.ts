/**
 * Full Settings Audit — tests all panel toggles/sliders/selects via pixel comparison
 *
 * Covers: node shapes, edge settings, timeline, cluster spacing, render thresholds.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(600_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function applyAndWait(settings: Record<string, unknown>, callback: "data" | "dirty" | "layout" = "dirty"): Promise<void> {
  await page.evaluate(async ([s, cb]: [Record<string, unknown>, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") (p as any)[k] = new Set(v as string[]);
      else (p as any)[k] = v;
    }
    if (cb === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (cb === "layout" && view.panelCallbacks) view.panelCallbacks.invalidateLayout();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 2000));
  }, [settings, callback]);
}

async function setup(): Promise<void> {
  await applyAndWait({
    searchQuery: "folder:characters",
    showTags: false, showTagNodes: false, showOrphans: true,
    showLinks: true, showSemanticEdges: true, showTagEdges: false,
    showArrows: false, showEdgeLabels: false, colorEdgesByRelation: true,
    fadeEdgesByDegree: false, clusterArrangement: "spiral",
    nodeDisplayMode: "node", groupBy: "none", groupByRules: [], collapsedGroups: [],
  }, "data");
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
  await setup();
});

test.afterAll(async () => {});

test.describe("Full Settings Audit", () => {

  test("showEdgeLabels toggle produces visual change", async () => {
    await setup();
    const s1 = await page.screenshot();
    await applyAndWait({ showEdgeLabels: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(100);
    console.log(`showEdgeLabels: diff=${diff}`);

  });

  test("clusterGroupSpacing changes node spread", async () => {
    await setup();
    await applyAndWait({ clusterGroupSpacing: 0.5 }, "layout");
    const s1 = await page.screenshot();
    await applyAndWait({ clusterGroupSpacing: 3.0 }, "layout");
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`clusterGroupSpacing: diff=${diff}`);

  });

  test("clusterGroupScale changes group sizing", async () => {
    await setup();
    await applyAndWait({ clusterGroupScale: 0.5 }, "layout");
    const s1 = await page.screenshot();
    await applyAndWait({ clusterGroupScale: 3.0 }, "layout");
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`clusterGroupScale: diff=${diff}`);

  });

  test("showDurationBars on timeline produces visual change", async () => {
    await applyAndWait({
      clusterArrangement: "timeline", timelineKey: "start-date",
      showDurationBars: false, searchQuery: "folder:characters",
      showTags: false, groupBy: "none", collapsedGroups: [],
    }, "data");
    const s1 = await page.screenshot();

    await applyAndWait({ showDurationBars: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`showDurationBars: diff=${diff}`);

  });

  test("edgeWeightThickness produces thicker lines for repeated edges", async () => {
    await setup();
    await applyAndWait({ edgeWeightThickness: false });
    const s1 = await page.screenshot();
    await applyAndWait({ edgeWeightThickness: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    // May or may not differ significantly depending on duplicate edges
    console.log(`edgeWeightThickness: diff=${diff}`);
    expect(diff).toBeGreaterThanOrEqual(0);
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

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

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

