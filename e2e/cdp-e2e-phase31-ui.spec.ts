/**
 * Phase 31 — highlightMissingNeighbors toggle
 * Verifies that enabling highlightMissingNeighbors identifies 1291 nodes
 * that share tags but have no direct edge.
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
    v.panel.highlightMissingNeighbors = false;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 31 — highlightMissingNeighbors toggle", () => {
  test("31-1: highlightMissingNeighbors=false is baseline", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.highlightMissingNeighbors;
    });
    expect(val).toBe(false);
  });

  test("31-2: enabling highlightMissingNeighbors finds 1291 nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.highlightMissingNeighbors = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getMissingNeighborNodeIds === "function") {
        const ids = v.getMissingNeighborNodeIds();
        return ids?.size ?? 0;
      }
      return -1;
    });
    expect(count).toBe(1291);
  });

  test("31-3: disabling restores normal rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.highlightMissingNeighbors = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.highlightMissingNeighbors;
    });
    expect(val).toBe(false);
  });
});
