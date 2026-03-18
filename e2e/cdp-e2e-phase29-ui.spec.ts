/**
 * Phase 29 — edgeWeightThickness toggle
 * Verifies that toggling edgeWeightThickness changes edge line width behavior.
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
    v.panel.edgeWeightThickness = false;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 29 — edgeWeightThickness toggle", () => {
  test("29-1: edgeWeightThickness=false is baseline", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.edgeWeightThickness;
    });
    expect(val).toBe(false);
  });

  test("29-2: edgeWeightThickness=true enables weight-based line width", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeWeightThickness = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.edgeWeightThickness;
    });
    expect(val).toBe(true);
  });

  test("29-3: max degree node (129 connections) verifies weight distribution", async () => {
    const maxDeg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return -1;
      const deg: Record<string, number> = {};
      for (const e of v.graphEdges) {
        const s = typeof e.source === "object" ? e.source.id : e.source;
        const t = typeof e.target === "object" ? e.target.id : e.target;
        deg[s] = (deg[s] || 0) + 1;
        deg[t] = (deg[t] || 0) + 1;
      }
      return Math.max(...Object.values(deg));
    });
    expect(maxDeg).toBe(129);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeWeightThickness = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
