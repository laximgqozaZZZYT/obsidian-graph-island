/**
 * Phase 6 — searchQuery input
 * Verifies that search queries filter nodes to correct counts.
 * tag:battle=132, path:classic-macbeth=172, empty=2354.
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
    v.panel.searchQuery = "";
    v.panel.showOrphans = true;
    v.panel.showTags = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 6 — searchQuery input", () => {
  test("6-1: tag:battle filters to exactly 132 nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "tag:battle";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(132);
  });

  test("6-2: path:classic-macbeth filters to exactly 172 nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "path:classic-macbeth";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(172);
  });

  test("6-3: clearing searchQuery restores all 2354 nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(2354);
  });
});
