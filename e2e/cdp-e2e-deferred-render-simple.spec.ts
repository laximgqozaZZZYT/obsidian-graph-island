/**
 * CDP E2E Test -- Deferred Render Simple
 *
 * Verifies basic deferred render pipeline: nodes exist, canvas renders,
 * and pixel data is non-empty after initialization.
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

test("canvas has non-zero pixel data after render", async () => {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { error: "no canvas" };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "no 2d context" };

    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, Math.min(w, 100), Math.min(h, 100));
    let nonZero = 0;
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i] + data.data[i+1] + data.data[i+2] > 0) nonZero++;
    }
    return { canvasWidth: w, canvasHeight: h, nonZeroPixels: nonZero };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.canvasWidth).toBeGreaterThan(0);
  expect(result.canvasHeight).toBeGreaterThan(0);
  expect(result.nonZeroPixels).toBeGreaterThan(0);
});

test("pixiNodes map is populated with graph data", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return { nodeCount: view.pixiNodes instanceof Map ? view.pixiNodes.size : -1 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(100);
});
