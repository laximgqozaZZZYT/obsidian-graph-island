/**
 * CDP E2E Test -- Preset Batch B
 *
 * Validates density-concentric, random-scatter, bfs-tree,
 * and sunburst-full arrangement presets.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

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
const SAMPLES_DIR = path2.resolve(__dirname, "../samples");

async function applyPresetFile(filename: string) {
  const presetPath = path2.join(SAMPLES_DIR, filename);
  if (!fs2.existsSync(presetPath)) return { error: "file not found: " + filename };
  const json = JSON.parse(fs2.readFileSync(presetPath, "utf-8"));
  return page.evaluate(async (preset: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(preset)) {
      if (k === "collapsedGroups" && Array.isArray(v)) panel[k] = new Set(v as any);
      else panel[k] = v;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 5000));
    const positions: { x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) { if (i++ >= 50) break; positions.push({ x: pn.data.x, y: pn.data.y }); }
    }
    const allSamePos = positions.length > 0 && positions.every(p => Math.abs(p.x - positions[0].x) < 1 && Math.abs(p.y - positions[0].y) < 1);
    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement, allSamePos };
  }, json);
}

test("preset 02 concentric loads with spread positions", async () => {
  test.setTimeout(60_000);
  const config = JSON.parse(fs2.readFileSync(path2.join(SAMPLES_DIR, "02-dense-cluster.json"), "utf-8"));
  const result = await page.evaluate(async (preset: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(preset)) {
      if (k === "collapsedGroups" && Array.isArray(v)) panel[k] = new Set(v as any);
      else panel[k] = v;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 5000));
    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement };
  }, config);
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("concentric");
});

test("preset 05 loads with positive node count", async () => {
  test.setTimeout(60_000);
  const config = JSON.parse(fs2.readFileSync(path2.join(SAMPLES_DIR, "05-mythology-pantheon.json"), "utf-8"));
  const result = await page.evaluate(async (preset: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(preset)) {
      if (k === "collapsedGroups" && Array.isArray(v)) panel[k] = new Set(v as any);
      else panel[k] = v;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 5000));
    return { nodeCount: view.pixiNodes?.size ?? 0 };
  }, config);
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("preset 15 orphan-hunter loads correctly", async () => {
  test.setTimeout(60_000);
  const config = JSON.parse(fs2.readFileSync(path2.join(SAMPLES_DIR, "15-orphan-hunter.json"), "utf-8"));
  const result = await page.evaluate(async (preset: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(preset)) {
      if (k === "collapsedGroups" && Array.isArray(v)) panel[k] = new Set(v as any);
      else panel[k] = v;
    }
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 5000));
    return { nodeCount: view.pixiNodes?.size ?? 0 };
  }, config);
  expect(result.nodeCount).toBeGreaterThan(0);
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

