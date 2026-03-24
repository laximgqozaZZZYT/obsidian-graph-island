/**
 * Rebuild verification — density parameter affects layout spacing
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";
const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);
let browser: Browser, page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser.contexts()[0].pages().find(p => p.url().includes("index.html")) ?? browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("changing density and rebuilding produces different layouts", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;

    v.panel.density = 0.3;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const nodes1 = v.graphData?.nodes ?? [];
    const spread1 = Math.max(...nodes1.map((n: any) => n.x)) - Math.min(...nodes1.map((n: any) => n.x));

    v.panel.density = 0.9;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const nodes2 = v.graphData?.nodes ?? [];
    const spread2 = Math.max(...nodes2.map((n: any) => n.x)) - Math.min(...nodes2.map((n: any) => n.x));

    v.panel.density = 0.5;
    v.rawData = null;
    v.doRender();
    return { spread1, spread2, count1: nodes1.length, count2: nodes2.length };
  });
  expect(result).not.toBeNull();
  expect(result!.count1).toBeGreaterThan(100);
  expect(result!.count2).toBeGreaterThan(100);
  // Different density should produce different spatial spread
  expect(result!.spread1).not.toBe(result!.spread2);
});

test("rebuild preserves total node count", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    const before = v.graphData?.nodes?.length ?? 0;
    v.rawData = null;
    v.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const after = v.graphData?.nodes?.length ?? 0;
    return { before, after };
  });
  expect(result).not.toBeNull();
  expect(result!.after).toBe(result!.before);

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

