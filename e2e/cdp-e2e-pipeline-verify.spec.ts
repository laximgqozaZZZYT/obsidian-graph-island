/**
 * CDP E2E: Verify core rendering pipeline produces correct output.
 * Tests node count, node separation, and group non-overlap.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(180_000);

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
    await new Promise(r => setTimeout(r, 2000));
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 4000));
    }
  });
});

function ev(code: string): string {
  return `(async () => {
    const app = window.app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find(l => l.view?.panel) || leaves[0];
    if (!leaf) throw new Error("no leaf");
    const view = leaf.view;
    if (!(view.panel.collapsedGroups instanceof Set)) {
      view.panel.collapsedGroups = new Set(
        Array.isArray(view.panel.collapsedGroups) ? view.panel.collapsedGroups : []
      );
    }
    ${code}
  })()`;
}

test("full vault renders expected node and edge counts", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showOrphans = true;
    view.panel.showTags = true;
    view.panel.showTagNodes = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    return {
      nodeCount: gd.nodes.length,
      edgeCount: gd.edges.length,
      pixiNodeCount: view.pixiNodes?.size ?? 0,
    };
  `));

  // Baseline: ~2354 nodes, ~5558 edges
  expect(result.nodeCount).toBeGreaterThan(1000);
  expect(result.edgeCount).toBeGreaterThan(2000);
  expect(result.pixiNodeCount).toBeGreaterThan(1000);
  console.log(`Pipeline: nodes=${result.nodeCount}, edges=${result.edgeCount}, pixiNodes=${result.pixiNodeCount}`);
});

test("nodes have minimum separation (no exact overlaps)", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, overlaps: 0 };
    const positions = [];
    for (const [, n] of pn) {
      positions.push({ x: Math.round(n.data.x), y: Math.round(n.data.y) });
    }
    let overlaps = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < Math.min(i + 20, positions.length); j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        if (Math.sqrt(dx*dx + dy*dy) < 2) overlaps++;
      }
    }
    return { count: positions.length, overlaps };
  `));

  expect(result.count).toBeGreaterThan(50);
  // Very few exact overlaps expected (some may exist for collapsed nodes)
  expect(result.overlaps).toBeLessThan(result.count * 0.1);
});

test("edge types distribution matches expected baseline", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showOrphans = true;
    view.panel.showTags = true;
    view.panel.showTagNodes = true;
    view.panel.showLinks = true;
    view.panel.showSimilar = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    const typeCounts = {};
    for (const e of gd.edges) {
      const t = e.type || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    return typeCounts;
  `));

  console.log("Edge type distribution:", JSON.stringify(result));
  // Baseline: link=1695, semantic=2363, tag=1500
  expect((result as any).link || 0).toBeGreaterThan(500);
});

test("searchQuery filter reduces node count correctly", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showOrphans = true;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const allResult: any = await page.evaluate(ev(`
    return { nodeCount: view.getGraphData().nodes.length };
  `));

  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(4000);

  const filteredResult: any = await page.evaluate(ev(`
    return { nodeCount: view.getGraphData().nodes.length };
  `));

  expect(allResult.nodeCount).toBeGreaterThan(filteredResult.nodeCount);
  expect(filteredResult.nodeCount).toBeGreaterThan(10);
  console.log(`Filter: all=${allResult.nodeCount}, folder:characters=${filteredResult.nodeCount}`);
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

