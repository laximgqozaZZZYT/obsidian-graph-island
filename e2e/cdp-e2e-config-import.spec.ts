/**
 * CDP E2E Test -- Config Import Round-Trip
 *
 * Verifies that JSON config files can be loaded into the panel state
 * and all fields survive a round-trip (import -> read-back -> verify).
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const SAMPLES_DIR = path2.resolve(__dirname, "..", "samples");

function loadSample(filename: string): Record<string, unknown> {
  return JSON.parse(fs2.readFileSync(path2.join(SAMPLES_DIR, filename), "utf-8"));
}

async function applyAndReadBack(raw: Record<string, unknown>) {
  return page.evaluate((config: Record<string, unknown>) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) throw new Error("No view");
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    for (const [key, value] of Object.entries(config)) {
      if (key === "collapsedGroups" && Array.isArray(value)) panel[key] = new Set(value);
      else panel[key] = value;
    }
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(config)) {
      const actual = panel[key];
      result[key] = actual instanceof Set ? Array.from(actual) : actual;
    }
    return result;
  }, raw);
}

test("preset 01 round-trip preserves arrangement and groupBy", async () => {
  const raw = loadSample("01-panorama-overview.json");
  const readBack = await applyAndReadBack(raw);
  expect(readBack.clusterArrangement).toBe(raw.clusterArrangement);
  expect(readBack.groupBy).toBe(raw.groupBy);

});

test("preset 08 round-trip preserves timeline settings", async () => {
  const raw = loadSample("08-sequence-tracker.json");
  const readBack = await applyAndReadBack(raw);
  expect(readBack.clusterArrangement).toBe("timeline");
  if ("showDurationBars" in raw) expect(readBack.showDurationBars).toBe(raw.showDurationBars);

});

test("preset 10 round-trip preserves heatmapMode", async () => {
  const raw = loadSample("10-maximalist.json");
  const readBack = await applyAndReadBack(raw);
  expect(readBack.heatmapMode).toBe(true);
});

test("custom config round-trip preserves coordinateLayout constants", async () => {
  const customConfig = {
    clusterArrangement: "custom",
    coordinateLayout: {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "cos(i*2*pi/n)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "sin(i*2*pi/n)", scale: 1 } },
      perGroup: true,
      constants: { r: 3, s: 0.7 },
    },
  };

  const readBack = await applyAndReadBack(customConfig);
  const cl = readBack.coordinateLayout as any;
  expect(cl).not.toBeNull();
  expect(cl.constants.r).toBe(3);
  expect(cl.constants.s).toBe(0.7);
  expect(cl.axis1.transform.expr).toBe("cos(i*2*pi/n)");

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

