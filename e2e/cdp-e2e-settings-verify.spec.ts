/**
 * CDP E2E: Verify panel settings persist and reflect in rendering.
 * Tests that setting values can be read back after assignment.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

test("boolean settings persist after assignment", async () => {
  const boolSettings = [
    "showOrphans", "showArrows", "showEnclosures", "showMinimap",
    "fadeEdgesByDegree", "showEdgeLabels", "showDotGrid", "scaleByDegree",
    "showBidirectionalIndicator", "showLabels",
  ];

  for (const setting of boolSettings) {
    await page.evaluate(ev(`view.panel.${setting} = true;`));
    const on: any = await page.evaluate(ev(`return view.panel.${setting};`));
    expect(on).toBe(true);

    await page.evaluate(ev(`view.panel.${setting} = false;`));
    const off: any = await page.evaluate(ev(`return view.panel.${setting};`));
    expect(off).toBe(false);
  }
});

test("string settings persist after assignment", async () => {
  const stringSettings: [string, string[]][] = [
    ["clusterArrangement", ["grid", "concentric", "triangle"]],
    ["nodeDisplayMode", ["node", "card", "donut"]],
    ["nodeColorMode", ["default", "category", "heatmap", "community"]],
    ["edgeDirectionFilter", ["all", "bidirectional", "unidirectional"]],
  ];

  for (const [setting, values] of stringSettings) {
    for (const val of values) {
      await page.evaluate(ev(`view.panel.${setting} = "${val}";`));
      const result: any = await page.evaluate(ev(`return view.panel.${setting};`));
      expect(result).toBe(val);
    }
  }
});

test("numeric settings persist after assignment", async () => {
  const numSettings: [string, number][] = [
    ["nodeSize", 8],
    ["linkDistance", 50],
    ["repelForce", 200],
    ["centerForce", 0.5],
    ["hoverHops", 3],
  ];

  for (const [setting, value] of numSettings) {
    await page.evaluate(ev(`view.panel.${setting} = ${value};`));
    const result: any = await page.evaluate(ev(`return view.panel.${setting};`));
    expect(result).toBe(value);
  }
});

test("searchQuery value is reflected in getGraphData filtering", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "tag:battle";
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const result: any = await page.evaluate(ev(`
    return {
      query: view.panel.searchQuery,
      nodeCount: view.getGraphData().nodes.length,
    };
  `));

  expect(result.query).toBe("tag:battle");
  // Baseline: tag:battle -> ~132 nodes
  expect(result.nodeCount).toBeGreaterThan(50);
  expect(result.nodeCount).toBeLessThan(500);
});

test("getState returns current panel values", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = false;
    view.panel.clusterArrangement = "triangle";
  `));

  const state: any = await page.evaluate(ev(`
    const s = view.getState();
    return {
      searchQuery: s.panel?.searchQuery,
      showOrphans: s.panel?.showOrphans,
      clusterArrangement: s.panel?.clusterArrangement,
    };
  `));

  expect(state.searchQuery).toBe("folder:characters");
  expect(state.showOrphans).toBe(false);
  expect(state.clusterArrangement).toBe("triangle");
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

