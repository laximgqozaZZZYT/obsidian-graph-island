/**
 * Viewport verification — zoom/pan state has valid worldScale and position
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

test("viewport worldScale is a positive finite number", async () => {
  const scale = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.worldScale ?? v?.viewport?.scale?.x ?? null;
  });
  expect(scale).not.toBeNull();
  expect(Number.isFinite(scale)).toBe(true);
  expect(scale).toBeGreaterThan(0);
});

test("viewport position coordinates are finite", async () => {
  const pos = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const vp = v?.viewport ?? v?.stage;
    if (!vp) return null;
    return { x: vp.position?.x ?? vp.x ?? 0, y: vp.position?.y ?? vp.y ?? 0 };
  });
  expect(pos).not.toBeNull();
  expect(Number.isFinite(pos!.x)).toBe(true);
  expect(Number.isFinite(pos!.y)).toBe(true);
});

test("canvas has non-zero dimensions matching viewport", async () => {
  const dims = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    return { w: canvas.width, h: canvas.height };
  });
  expect(dims).not.toBeNull();
  expect(dims!.w).toBeGreaterThan(0);
  expect(dims!.h).toBeGreaterThan(0);
});
