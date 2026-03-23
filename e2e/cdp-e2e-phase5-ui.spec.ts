/**
 * Phase 5 — nodeColorMode dropdown
 * Verifies that switching nodeColorMode changes the color distribution.
 * Baseline: default=1 color, community=20, heatmap>=60.
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

