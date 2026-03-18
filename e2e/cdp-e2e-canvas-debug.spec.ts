/**
 * Canvas element verification — dimensions, context, viewport coverage
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);
let browser: Browser, page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser.contexts()[0].pages().find(p => p.url().includes("index.html")) ?? browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("canvas element exists with positive dimensions", async () => {
  const dims = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  });
  expect(dims).not.toBeNull();
  expect(dims!.width).toBeGreaterThan(100);
  expect(dims!.height).toBeGreaterThan(100);
});

test("canvas has a valid rendering context", async () => {
  const hasContext = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  });
  expect(hasContext).toBe(true);
});

test("canvas occupies significant viewport area", async () => {
  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
  });
  expect(ratio).toBeGreaterThan(0.3);
});
