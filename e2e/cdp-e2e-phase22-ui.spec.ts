/**
 * Phase 22 — showGraphStats toggle
 * Verifies that enabling showGraphStats displays correct node/edge/density values.
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
    v.panel.showGraphStats = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 22 — showGraphStats toggle", () => {
  test("22-1: stats panel shows node count 2354", async () => {
    const text = await page.evaluate(() => {
      const el = document.querySelector(".gi-graph-stats");
      return el?.textContent ?? "";
    });
    expect(text).toContain("2354");
  });

  test("22-2: stats panel shows edge count 5558", async () => {
    const text = await page.evaluate(() => {
      const el = document.querySelector(".gi-graph-stats");
      return el?.textContent ?? "";
    });
    expect(text).toContain("5558");
  });

  test("22-3: stats panel shows density 0.0020", async () => {
    const density = await page.evaluate(() => {
      const cells = document.querySelectorAll(".gi-graph-stats .gi-stats-value");
      for (const cell of cells) {
        const text = cell.textContent ?? "";
        if (text.match(/^0\.00\d+$/)) return text;
      }
      return null;
    });
    expect(density).toBe("0.0020");

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showGraphStats = false;
    });
  });
});
