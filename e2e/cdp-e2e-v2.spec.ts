/**
 * CDP E2E Test -- V2 Core Verification
 *
 * Verifies core view structure: plugin load, canvas element,
 * node data, edge data, and layout switching.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test("plugin is loaded with correct manifest", async () => {
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    return {
      loaded: "graph-island" in (app?.plugins?.plugins ?? {}),
      version: app?.plugins?.manifests?.["graph-island"]?.version,
    };
  });
  expect(result.loaded).toBe(true);
  expect(result.version).toBeTruthy();
});

test("graph view has canvas and worldContainer", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCanvas: view?.pixiApp?.view instanceof HTMLCanvasElement,
      hasWorldContainer: !!view.worldContainer,
      hasSimulation: !!view.simulation,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCanvas).toBe(true);
  expect(result.hasWorldContainer).toBe(true);
  expect(result.hasSimulation).toBe(true);
});

test("layout switching between spiral and grid works", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "spiral";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const spiral = panel.clusterArrangement;

    panel.clusterArrangement = "grid";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const grid = panel.clusterArrangement;

    return { spiral, grid, canvasOk: view.pixiApp?.view instanceof HTMLCanvasElement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.spiral).toBe("spiral");
  expect(result.grid).toBe("grid");
  expect(result.canvasOk).toBe(true);
});

test("all standard arrangements render without crash", async () => {
  test.setTimeout(90_000);
  const layouts = ["spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "sunburst"];
  for (const layout of layouts) {
    const result = await page.evaluate(async (l: string) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      panel.clusterArrangement = l;
      if (typeof view.doRender === "function") view.doRender();
      await new Promise(r => setTimeout(r, 2000));
      return { layout: l, nodes: view.pixiNodes?.size ?? 0, canvasOk: !!view.pixiApp?.view };
    }, layout);
    expect(result.canvasOk).toBe(true);
    expect(result.nodes).toBeGreaterThan(0);
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

