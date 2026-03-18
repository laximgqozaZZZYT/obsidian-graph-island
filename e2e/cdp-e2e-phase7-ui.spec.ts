/**
 * Phase 7 — clusterArrangement
 * Verifies that changing clusterArrangement alters node positions.
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
    v.panel.groupBy = "folder:?";
    v.panel.clusterArrangement = "concentric";
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 7 — clusterArrangement", () => {
  test("7-1: concentric arrangement produces valid node positions", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return null;
      const positions: { x: number; y: number }[] = [];
      for (const pn of v.pixiNodes.values()) {
        if (pn.x != null && pn.y != null) positions.push({ x: pn.x, y: pn.y });
      }
      const xRange = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x));
      const yRange = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y));
      return { count: positions.length, xRange, yRange, arrangement: v.panel.clusterArrangement };
    });
    expect(result).not.toBeNull();
    expect(result!.arrangement).toBe("concentric");
    expect(result!.count).toBeGreaterThan(0);
    expect(result!.xRange).toBeGreaterThan(0);
  });

  test("7-2: switching to grid arrangement changes node spread", async () => {
    // Capture concentric spread
    const concentricSpread = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sumDist = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.x != null && pn.y != null) {
          sumDist += Math.sqrt(pn.x * pn.x + pn.y * pn.y);
          n++;
        }
      }
      return n > 0 ? sumDist / n : -1;
    });

    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.clusterArrangement = "grid";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const gridSpread = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      let sumDist = 0, n = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.x != null && pn.y != null) {
          sumDist += Math.sqrt(pn.x * pn.x + pn.y * pn.y);
          n++;
        }
      }
      return n > 0 ? sumDist / n : -1;
    });

    // The two arrangements should produce different spatial distributions
    expect(gridSpread).not.toBe(concentricSpread);
    expect(gridSpread).toBeGreaterThan(0);
  });

  test("7-3: arrangement panel property reflects current setting", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.clusterArrangement;
    });
    expect(val).toBe("grid");

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.clusterArrangement = "concentric";
      v.panel.groupBy = "";
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
