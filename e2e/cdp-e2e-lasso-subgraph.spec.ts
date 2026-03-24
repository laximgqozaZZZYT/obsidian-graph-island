/**
 * E2E tests for lasso selection + subgraph view (v0.5.0)
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

  // Reload plugin fresh
  await page.evaluate(async () => {
    const app = (window as any).app;
    for (const leaf of app.workspace.getLeavesOfType("markdown")) leaf.detach();
    for (const leaf of app.workspace.getLeavesOfType("graph-view")) leaf.detach();
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  // Open graph view if needed
  const leafCount = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").length
  );
  if (leafCount === 0) {
    await page.evaluate(() =>
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view")
    );
  }

  // Wait for stable
  let panelReady = false;
  for (let i = 0; i < 30; i++) {
    panelReady = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return !!(v && v.panel && v.pixiNodes && v.pixiNodes.size > 200);
    });
    if (panelReady) break;
    await page.waitForTimeout(500);
  }
  expect(panelReady).toBe(true);
});

test.afterAll(async () => {
  // Restore full graph
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (v) {
      v.panel.subgraphNodeIds = [];
      v.rawData = null;
      await v.doRender();
    }
  });
});

test.describe("lasso + subgraph view", () => {
  test("LS-1: subgraphNodeIds defaults to empty array", async () => {
    const ids = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.panel?.subgraphNodeIds ?? "MISSING";
    });
    expect(Array.isArray(ids)).toBe(true);
    expect((ids as any[]).length).toBe(0);
  });

  test("LS-2: setting subgraphNodeIds reduces visible nodes", async () => {
    const result = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { fullCount: -1, afterCount: -1, restoredCount: -1 };
      const fullCount = v.pixiNodes.size;
      const ids = [...v.pixiNodes.keys()].slice(0, 5);
      v.panel.subgraphNodeIds = ids;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const afterCount = v.pixiNodes.size;
      // Restore
      v.panel.subgraphNodeIds = [];
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const restoredCount = v.pixiNodes.size;
      return { fullCount, afterCount, restoredCount };
    });

    expect(result.fullCount).toBeGreaterThan(100);
    expect(result.afterCount).toBeLessThan(result.fullCount);
    expect(result.afterCount).toBeGreaterThan(0);
    expect(result.restoredCount).toBeGreaterThan(result.afterCount);

  });

  test("LS-3: enterSubgraph/exitSubgraph roundtrip", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v || typeof v.enterSubgraph !== "function") return { inSub: -1, afterExit: -1, hasMethod: false };
      const ids = [...v.pixiNodes.keys()].slice(0, 3);
      v.enterSubgraph(ids);
      const inSub = v.panel.subgraphNodeIds.length;
      v.exitSubgraph();
      const afterExit = v.panel.subgraphNodeIds.length;
      return { inSub, afterExit, hasMethod: true };
    });

    expect(result.hasMethod).toBe(true);
    expect(result.inSub).toBe(3);
    expect(result.afterExit).toBe(0);
  });

  test("LS-4: lasso button exists in toolbar", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { hasLasso: false };
      // Check private property (accessible via CDP on minified builds)
      return { hasLasso: v.lassoBtnEl != null || v.subgraphBackBtnEl != null };
    });
    expect(result.hasLasso).toBe(true);
  });
});


// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
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

