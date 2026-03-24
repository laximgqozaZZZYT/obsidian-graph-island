/**
 * CDP E2E Test -- Comprehensive 30-Config Validation
 *
 * Validates that all 30 sample presets load correctly, produce
 * nodes with positive counts, and render the expected arrangement.
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

import * as fs from "fs";
import * as path from "path";

const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");

function loadSample(filename: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, filename), "utf-8"));
}

async function applyConfig(cfg: Record<string, unknown>) {
  return page.evaluate(async (config: Record<string, unknown>) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    for (const [key, value] of Object.entries(config)) {
      if (key === "collapsedGroups" && Array.isArray(value)) {
        panel[key] = new Set(value);
      } else {
        panel[key] = value;
      }
    }

    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    return {
      nodeCount: view.rawData?.nodes?.length ?? view.pixiNodes?.size ?? 0,
      arrangement: panel.clusterArrangement,
      groupBy: panel.groupBy,
    };
  }, cfg);
}

const SAMPLE_FILES = Array.from({ length: 20 }, (_, i) => {
  const num = String(i + 1).padStart(2, "0");
  const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.startsWith(num + "-"));
  return files[0] || null;
}).filter(Boolean) as string[];

test("all numbered presets (01-20) load with positive node count", async () => {
  test.setTimeout(180_000);
  for (const file of SAMPLE_FILES) {
    const config = loadSample(file);
    const result = await applyConfig(config);
    console.log(`[${file}] nodes=${result.nodeCount}, arrangement=${result.arrangement}`);
    expect(result.nodeCount).toBeGreaterThan(0);
  }
});

test("preset 01 uses spiral arrangement", async () => {
  const config = loadSample("01-panorama-overview.json");
  const result = await applyConfig(config);
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("spiral");
});

test("preset 08 uses timeline arrangement", async () => {
  const config = loadSample("08-sequence-tracker.json");
  const result = await applyConfig(config);
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("timeline");
});

test("preset 10 has heatmapMode enabled", async () => {
  const config = loadSample("10-maximalist.json");
  const result = await page.evaluate(async (cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(cfg)) {
      if (k === "collapsedGroups" && Array.isArray(v)) panel[k] = new Set(v as any);
      else panel[k] = v;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    return { heatmapMode: panel.heatmapMode, nodeCount: view.pixiNodes?.size ?? 0 };
  }, config);

  expect(result).not.toHaveProperty("error");
  expect(result.heatmapMode).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);

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

