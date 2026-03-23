/**
 * Phase 21 — showLegend toggle
 * Verifies that toggling showLegend controls the legend overlay DOM element.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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
    v.panel.nodeColorMode = "community";
    v.panel.showLegend = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 21 — showLegend toggle", () => {
  test("21-1: showLegend=true renders legend DOM element", async () => {
    const result = await page.evaluate(() => {
      const legend = document.querySelector(".gi-legend");
      if (!legend) return { exists: false, itemCount: 0 };
      const items = legend.querySelectorAll(".gi-legend-item");
      return { exists: true, itemCount: items.length };
    });
    expect(result.exists).toBe(true);
    expect(result.itemCount).toBeGreaterThan(0);
  });

  test("21-2: legend items have labels and color indicators", async () => {
    const result = await page.evaluate(() => {
      const legend = document.querySelector(".gi-legend");
      if (!legend) return null;
      const items = legend.querySelectorAll(".gi-legend-item");
      const data = Array.from(items).slice(0, 5).map(item => ({
        label: item.querySelector(".gi-legend-label")?.textContent ?? "",
        hasDot: !!item.querySelector(".gi-legend-dot"),
      }));
      return { count: items.length, samples: data };
    });
    expect(result).not.toBeNull();
    expect(result!.count).toBeGreaterThan(0);
    for (const sample of result!.samples) {
      expect(sample.label).toBeTruthy();
      expect(sample.hasDot).toBe(true);
    }
  });

  test("21-3: showLegend=false hides legend", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showLegend = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      const legend = document.querySelector(".gi-legend");
      return {
        exists: !!legend,
        hidden: !legend || getComputedStyle(legend).display === "none",
      };
    });
    expect(result.hidden || !result.exists).toBe(true);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "default";
      v.panel.showLegend = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});

