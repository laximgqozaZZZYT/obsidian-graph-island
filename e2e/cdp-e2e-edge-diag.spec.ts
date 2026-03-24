/**
 * Edge toggle verification — toggling edge types changes visible edge count
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";
const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);
let browser: Browser, page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser.contexts()[0].pages().find(p => p.url().includes("index.html")) ?? browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("disabling showLinks hides link-type edges from rendering", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showLinks = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const allEdges = v.graphData?.edges?.length ?? 0;

    v.panel.showLinks = false;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withoutLinks = v.graphData?.edges?.length ?? 0;

    v.panel.showLinks = true;
    v.doRender();
    return { allEdges, withoutLinks };
  });
  expect(result).not.toBeNull();
  expect(result!.allEdges).toBeGreaterThan(result!.withoutLinks);

  // === Visual quality: verify display after state change ===
  const _dq = await measureScreenDensity(page);
  if (_dq.totalNodes > 10) {
    expect(_dq.worstCellCount).toBeLessThan(200);
  }
});

test("disabling showSimilar hides semantic-type edges", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showSimilar = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withSimilar = v.graphData?.edges?.length ?? 0;

    v.panel.showSimilar = false;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withoutSimilar = v.graphData?.edges?.length ?? 0;

    v.panel.showSimilar = true;
    v.doRender();
    return { withSimilar, withoutSimilar };
  });
  expect(result).not.toBeNull();
  expect(result!.withSimilar).toBeGreaterThan(result!.withoutSimilar);

  // === Visual quality: verify display after state change ===
  const _dq = await measureScreenDensity(page);
  if (_dq.totalNodes > 10) {
    expect(_dq.worstCellCount).toBeLessThan(200);
  }
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

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

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

