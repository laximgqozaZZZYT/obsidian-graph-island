/**
 * CDP E2E Test -- Preset Batch A
 *
 * Validates 4 test presets with different coordinate systems:
 * folder-degree, tag-category, timeline-story, hub-radial.
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
const SAMPLES_DIR = path2.resolve(__dirname, "../samples");

async function applyPresetFile(filename: string): Promise<any> {
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
    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement, edgeCount: view.graphEdges?.length ?? 0 };
  }, json);
}

test("test-folder-degree preset loads with nodes", async () => {
  test.setTimeout(60_000);
  const result = await applyPresetFile("test-folder-degree.json");
  if (result.error === "file not found: test-folder-degree.json") { test.skip(); return; }
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.edgeCount).toBeGreaterThan(0);
});

test("test-tag-category preset loads with nodes", async () => {
  test.setTimeout(60_000);
  const result = await applyPresetFile("test-tag-category-matrix.json");
  if (result.error === "file not found: test-tag-category-matrix.json") { test.skip(); return; }
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("test-timeline-story preset uses timeline arrangement", async () => {
  test.setTimeout(60_000);
  const result = await applyPresetFile("test-timeline-story.json");
  if (result.error === "file not found: test-timeline-story.json") { test.skip(); return; }
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("timeline");
});

test("test-hub-radial preset loads with nodes", async () => {
  test.setTimeout(60_000);
  const result = await applyPresetFile("test-hub-radial.json");
  if (result.error === "file not found: test-hub-radial.json") { test.skip(); return; }
  expect(result.nodeCount).toBeGreaterThan(0);
});
