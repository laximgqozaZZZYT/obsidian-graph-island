/**
 * Phase 9 — showMinimap toggle
 * Verifies that toggling showMinimap controls minimap DOM presence.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);

let browser: Browser;
let page: Page;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  page = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.showMinimap = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 9 — showMinimap toggle", () => {
  test("9-1: showMinimap=true renders minimap DOM element", async () => {
    const result = await page.evaluate(() => {
      const minimap = document.querySelector(".gi-minimap-wrap");
      return {
        exists: !!minimap,
        visible: minimap ? getComputedStyle(minimap).display !== "none" : false,
        panelVal: (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.panel?.showMinimap,
      };
    });
    expect(result.exists).toBe(true);
    expect(result.panelVal).toBe(true);
  });

  test("9-2: showMinimap=false hides minimap", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showMinimap = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      const minimap = document.querySelector(".gi-minimap-wrap");
      return {
        exists: !!minimap,
        hidden: !minimap || getComputedStyle(minimap).display === "none",
        panelVal: (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.panel?.showMinimap,
      };
    });
    expect(result.panelVal).toBe(false);
    // Minimap should be either removed or hidden
    expect(result.hidden || !result.exists).toBe(true);
  });

  test("9-3: re-enabling showMinimap restores minimap", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showMinimap = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      const minimap = document.querySelector(".gi-minimap-wrap");
      return { exists: !!minimap };
    });
    expect(result.exists).toBe(true);
  });
});
