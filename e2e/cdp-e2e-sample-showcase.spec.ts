/**
 * CDP E2E Test -- Sample Config Showcase
 *
 * Validates that sample configs 23-30 load correctly, render
 * with correct arrangement, and produce spatial spread.
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
