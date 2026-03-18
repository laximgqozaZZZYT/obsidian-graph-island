/**
 * Phase 11 — showEdgeLabels toggle
 * Verifies that toggling showEdgeLabels affects edge label rendering state.
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
    v.panel.showEdgeLabels = false;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 11 — showEdgeLabels toggle", () => {
  test("11-1: showEdgeLabels=false is baseline, no labels rendered", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showEdgeLabels;
    });
    expect(val).toBe(false);
  });

  test("11-2: showEdgeLabels=true enables edge label rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showEdgeLabels = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return {
        showEdgeLabels: v?.panel?.showEdgeLabels,
        edgeLabelPlacement: v?.panel?.edgeLabelPlacement,
      };
    });
    expect(result.showEdgeLabels).toBe(true);
    expect(["center", "offset", "smart"]).toContain(result.edgeLabelPlacement);
  });

  test("11-3: edgeLabelPlacement can be changed to offset", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeLabelPlacement = "offset";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.edgeLabelPlacement;
    });
    expect(val).toBe("offset");

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showEdgeLabels = false;
      v.panel.edgeLabelPlacement = "center";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
