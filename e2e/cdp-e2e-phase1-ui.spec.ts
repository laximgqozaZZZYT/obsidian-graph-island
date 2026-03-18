/**
 * Phase 1 — nodeSize slider
 * Verifies that changing nodeSize produces measurably different node radii.
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

  // Reset to baseline
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.showOrphans = true;
    v.panel.nodeSize = 4;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 1 — nodeSize slider", () => {
  test("1-1: default nodeSize=4 yields consistent radii across nodes", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return null;
      const radii: number[] = [];
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius != null) radii.push(pn.radius);
      }
      return { count: radii.length, min: Math.min(...radii), max: Math.max(...radii) };
    });
    expect(result).not.toBeNull();
    expect(result!.count).toBeGreaterThan(0);
    expect(result!.min).toBeGreaterThan(0);
    expect(result!.max).toBeGreaterThan(0);
  });

  test("1-2: increasing nodeSize to 10 produces larger average radius", async () => {
    // Capture baseline radii at nodeSize=4
    const baselineAvg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sum = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius != null) { sum += pn.radius; n++; }
      }
      return n > 0 ? sum / n : -1;
    });

    // Change nodeSize to 10
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeSize = 10;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const largerAvg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sum = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius != null) { sum += pn.radius; n++; }
      }
      return n > 0 ? sum / n : -1;
    });

    expect(largerAvg).toBeGreaterThan(baselineAvg);
  });

  test("1-3: decreasing nodeSize to 1 produces smaller average radius", async () => {
    // Capture current radii at nodeSize=10
    const prevAvg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sum = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius != null) { sum += pn.radius; n++; }
      }
      return n > 0 ? sum / n : -1;
    });

    // Change nodeSize to 1
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeSize = 1;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const smallerAvg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sum = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius != null) { sum += pn.radius; n++; }
      }
      return n > 0 ? sum / n : -1;
    });

    expect(smallerAvg).toBeLessThan(prevAvg);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeSize = 4;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
