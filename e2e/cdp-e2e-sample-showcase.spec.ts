/**
 * CDP E2E Test -- Sample Config Showcase
 *
 * Validates that sample configs 23-30 load correctly, render
 * with correct arrangement, and produce spatial spread.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

import * as fs2 from "fs";
import * as path2 from "path";
const SAMPLES_DIR = path2.resolve(__dirname, "..", "samples");

function loadSample(filename: string) {
  return JSON.parse(fs2.readFileSync(path2.join(SAMPLES_DIR, filename), "utf-8"));
}

async function applyAndRender(config: Record<string, unknown>) {
  return page.evaluate(async (cfg: Record<string, unknown>) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) throw new Error("No view");
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [key, value] of Object.entries(cfg)) {
      if (key === "collapsedGroups" && Array.isArray(value)) panel[key] = new Set(value);
      else panel[key] = value;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const positions = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) { if (i++ >= 30) break; positions.push({ x: pn.data.x, y: pn.data.y }); }
    }
    return { nodeCount: view.rawData?.nodes?.length ?? view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement, groupBy: panel.groupBy, positions };
  }, config);
}

test("sample 23 spiral-galaxy loads with spiral arrangement", async () => {
  test.setTimeout(60_000);
  const result = await applyAndRender(loadSample("23-spiral-galaxy.json"));
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("spiral");
});

test("sample 25 rose-curve loads with custom arrangement", async () => {
  test.setTimeout(60_000);
  const result = await applyAndRender(loadSample("25-rose-curve.json"));
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("custom");
});

test("sample 29 concentric-degree loads with concentric arrangement", async () => {
  test.setTimeout(60_000);
  const result = await applyAndRender(loadSample("29-concentric-degree.json"));
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("concentric");
});

test("sample 30 mountain-ridge loads with mountain arrangement", async () => {
  test.setTimeout(60_000);
  const result = await applyAndRender(loadSample("30-mountain-ridge.json"));
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("mountain");
  if (result.positions.length >= 3) {
    const ys = result.positions.map((p: any) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
  }
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

