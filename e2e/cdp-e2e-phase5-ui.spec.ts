/**
 * Phase 5 — nodeColorMode dropdown
 * Verifies that switching nodeColorMode changes the color distribution.
 * Baseline: default=1 color, community=20, heatmap>=60.
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
    v.panel.nodeColorMode = "default";
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

function countDistinctColors(): string {
  return `(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v?.pixiNodes) return -1;
    const colors = new Set();
    for (const pn of v.pixiNodes.values()) {
      if (pn.color != null) colors.add(pn.color);
    }
    return colors.size;
  })()`;
}

test.describe("Phase 5 — nodeColorMode dropdown", () => {
  test("5-1: default mode uses exactly 1 distinct color", async () => {
    const count = await page.evaluate(countDistinctColors());
    expect(count).toBe(1);
  });

  test("5-2: community mode produces exactly 20 distinct colors", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "community";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(countDistinctColors());
    expect(count).toBe(20);
  });

  test("5-3: heatmap mode produces 60+ distinct colors", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "heatmap";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(countDistinctColors());
    expect(count).toBeGreaterThanOrEqual(60);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "default";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
