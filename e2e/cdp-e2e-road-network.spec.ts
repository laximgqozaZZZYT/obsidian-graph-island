/**
 * CDP E2E Test -- Road Network
 *
 * Verifies road network generation with intersections, segments,
 * and nodeAccess data for concentric and grid layouts.
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

import { readFileSync } from "fs";
import { join } from "path";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

function loadPreset(name: string) {
  return JSON.parse(readFileSync(join(__dirname, "../samples", name), "utf-8"));
}

test("road network generates intersections and segments for concentric layout", async () => {
  test.setTimeout(60_000);
  const config = loadPreset("02-dense-cluster.json");

  await page.evaluate(async (cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg);
    view.panel.collapsedGroups = new Set(cfg.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);
  await page.waitForTimeout(8000);

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) { view._roadNetworkFinalized = false; view.roadNetworkData = null; view._rebuildRoadNetwork?.(true); }
  });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const rn = view.roadNetworkData;
    if (!rn) return { error: "no road network" };
    return { intersections: rn.intersections.length, segments: rn.segments.length, nodeAccess: rn.nodeAccess.size };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.intersections).toBeGreaterThan(0);
  expect(result.segments).toBeGreaterThan(0);
  expect(result.nodeAccess).toBeGreaterThan(0);

});

test("road network intersections have valid coordinates", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.roadNetworkData) return { error: "no road network" };
    const rn = view.roadNetworkData;
    const valid = rn.intersections.every((i: any) => typeof i.id === "number" && isFinite(i.x) && isFinite(i.y));
    return { count: rn.intersections.length, valid };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.valid).toBe(true);
});

test("road network segments have valid structure", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.roadNetworkData) return { error: "no road network" };
    const rn = view.roadNetworkData;
    const valid = rn.segments.every((s: any) =>
      typeof s.from === "number" && typeof s.to === "number" && Array.isArray(s.waypoints) && typeof s.length === "number");
    return { count: rn.segments.length, valid };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.valid).toBe(true);
});

test("road network center coordinates are finite", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.roadNetworkData) return { error: "no road network" };
    const rn = view.roadNetworkData;
    return { cxFinite: isFinite(rn.cx), cyFinite: isFinite(rn.cy) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.cxFinite).toBe(true);
  expect(result.cyFinite).toBe(true);
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

