/**
 * Phase 7 — clusterArrangement
 * Verifies that changing clusterArrangement alters node positions.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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


// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
  }
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

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

