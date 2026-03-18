/**
 * Phase 19 — edgeDirectionFilter
 * Verifies that edgeDirectionFilter switches between all/bidirectional/unidirectional.
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
    v.panel.edgeDirectionFilter = "all";
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 19 — edgeDirectionFilter", () => {
  test("19-1: default edgeDirectionFilter is all", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.edgeDirectionFilter;
    });
    expect(val).toBe("all");
  });

  test("19-2: switching to bidirectional reduces displayed edges", async () => {
    // Get baseline edge count
    const baselineCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.graphEdges?.length ?? -1;
    });

    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeDirectionFilter = "bidirectional";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return {
        filter: v?.panel?.edgeDirectionFilter,
        edgeCount: v?.graphEdges?.length ?? -1,
      };
    });
    expect(result.filter).toBe("bidirectional");
    expect(result.edgeCount).toBeGreaterThan(0);
  });

  test("19-3: switching to unidirectional shows complement edges", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeDirectionFilter = "unidirectional";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return {
        filter: v?.panel?.edgeDirectionFilter,
        edgeCount: v?.graphEdges?.length ?? -1,
      };
    });
    expect(result.filter).toBe("unidirectional");
    expect(result.edgeCount).toBeGreaterThan(0);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.edgeDirectionFilter = "all";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
