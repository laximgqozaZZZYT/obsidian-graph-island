/**
 * Phase 14 — showSemanticEdges toggle
 * Verifies that toggling showSemanticEdges controls semantic edge rendering.
 * Baseline: semantic=2363 edges.
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
    v.panel.showSemanticEdges = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 14 — showSemanticEdges toggle", () => {
  test("14-1: baseline has 2363 semantic-type edges", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return -1;
      let cnt = 0;
      for (const e of v.graphEdges) {
        if (e.type === "semantic") cnt++;
      }
      return cnt;
    });
    expect(count).toBe(2363);
  });

  test("14-2: showSemanticEdges=false disables semantic edge rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showSemanticEdges = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showSemanticEdges;
    });
    expect(val).toBe(false);
  });

  test("14-3: re-enabling showSemanticEdges restores rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showSemanticEdges = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showSemanticEdges;
    });
    expect(val).toBe(true);
  });
});
