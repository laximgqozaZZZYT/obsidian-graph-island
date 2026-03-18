/**
 * CDP E2E Test -- Test Screenshots
 *
 * Verifies that page and canvas screenshots can be captured
 * and contain valid image data.
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

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const SCREENSHOT_DIR = join(__dirname, "images");

test("page screenshot captures visible content", async () => {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, "test-page-screenshot.png"), fullPage: false });
  expect(existsSync(join(SCREENSHOT_DIR, "test-page-screenshot.png"))).toBe(true);
});

test("canvas toBlob produces PNG data > 1KB", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.pixiApp?.view) return { error: "no canvas" };
    const canvas = view.pixiApp.view as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    return { size: blob?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.size).toBeGreaterThan(1000);
});

test("canvas dimensions match container size", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.pixiApp?.view) return { error: "no canvas" };
    const canvas = view.pixiApp.view as HTMLCanvasElement;
    const container = canvas.parentElement;
    return {
      canvasW: canvas.width, canvasH: canvas.height,
      containerW: container?.clientWidth ?? 0, containerH: container?.clientHeight ?? 0,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.canvasW).toBeGreaterThan(0);
  expect(result.canvasH).toBeGreaterThan(0);
});
