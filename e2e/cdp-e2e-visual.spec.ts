/**
 * CDP E2E Test -- Visual & Deep Tests
 *
 * Verifies visual rendering: node position spread, edge visibility,
 * and canvas pixel content after render.
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

test("nodes have non-zero positions across the canvas", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    let nonZero = 0; let total = 0;
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        total++;
        if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) nonZero++;
      }
    }
    return { total, nonZero, pct: total > 0 ? Math.round(nonZero / total * 100) : 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.total).toBeGreaterThan(0);
  expect(result.nonZero).toBeGreaterThan(result.total * 0.5);
});

test("canvas has rendered pixel content", async () => {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { error: "no canvas" };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "no context" };
    const data = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
    let nonZero = 0;
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i] + data.data[i+1] + data.data[i+2] > 0) nonZero++;
    }
    return { nonZeroPixels: nonZero };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nonZeroPixels).toBeGreaterThan(0);
});

test("edge data is populated with source and target", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const edges = view.graphEdges ?? [];
    const sampleEdge = edges[0];
    return {
      edgeCount: edges.length,
      hasSource: !!sampleEdge?.source,
      hasTarget: !!sampleEdge?.target,
      hasType: !!sampleEdge?.type,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.edgeCount).toBeGreaterThan(0);
  expect(result.hasSource).toBe(true);
  expect(result.hasTarget).toBe(true);
  expect(result.hasType).toBe(true);
});
