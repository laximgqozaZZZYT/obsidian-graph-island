/**
 * CDP E2E Test -- Screenshot Generation
 *
 * Verifies that screenshot capture produces a valid PNG blob
 * from the canvas element.
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

test("canvas element produces valid screenshot blob", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.pixiApp?.view) return { error: "no canvas" };
    const canvas = view.pixiApp.view as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    return { hasBlob: !!blob, blobSize: blob?.size ?? 0, canvasWidth: canvas.width, canvasHeight: canvas.height };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasBlob).toBe(true);
  expect(result.blobSize).toBeGreaterThan(1000);
  expect(result.canvasWidth).toBeGreaterThan(0);
  expect(result.canvasHeight).toBeGreaterThan(0);
});

test("page screenshot captures workspace including graph", async () => {
  await page.screenshot({ path: "e2e/screenshot-workspace.png", fullPage: false });
  const exists = require("fs").existsSync("e2e/screenshot-workspace.png");
  expect(exists).toBe(true);
});

test("canvas has visible content with non-zero pixels", async () => {
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
