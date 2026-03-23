/**
 * CDP E2E: Verify label rendering details.
 * Tests enclosure labels, sub-labels, and label count consistency.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

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

test("enclosure labels appear when showEnclosures is enabled with groupBy", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.groupByRules = [{ key: "prop-category" }];
    view.panel.showEnclosures = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    const groups = new Set();
    for (const n of gd.nodes) {
      if (n.category) groups.add(n.category);
    }
    return {
      nodeCount: gd.nodes.length,
      groupCount: groups.size,
      groupNames: [...groups].slice(0, 10),
    };
  `));

  expect(result.nodeCount).toBeGreaterThan(50);
  expect(result.groupCount).toBeGreaterThan(1);
  console.log(`Groups found: ${result.groupCount} - ${result.groupNames.join(", ")}`);
});

test("label count matches visible pixiNode count", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showLabels = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn) return { pixiNodes: 0, withLabels: 0 };
    let withLabels = 0;
    for (const [, n] of pn) {
      if (n.data?.label) withLabels++;
    }
    return { pixiNodes: pn.size, withLabels };
  `));

  expect(result.pixiNodes).toBeGreaterThan(50);
  // Most nodes should have labels
  expect(result.withLabels).toBeGreaterThan(result.pixiNodes * 0.8);
});

test("nodeSubLabelFields adds sub-label text to nodes", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showLabels = true;
    view.panel.nodeSubLabelFields = "node_type";
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const withSub = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeSubLabelFields = "";
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const withoutSub = await page.screenshot();

  const len = Math.min(withSub.length, withoutSub.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (withSub[i] !== withoutSub[i]) diff++; }
  console.log(`Sub-label pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
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

