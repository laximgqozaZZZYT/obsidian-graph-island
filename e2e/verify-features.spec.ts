/**
 * CDP E2E: Verify core features are wired up end-to-end.
 * Tests plugin loading, graph data pipeline, and basic feature toggles.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
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

test("plugin is loaded and graph view has pixiApp", async () => {
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.["graph-island"];
    const leaves = app?.workspace?.getLeavesOfType("graph-view") || [];
    return {
      pluginLoaded: !!plugin,
      leafCount: leaves.length,
      hasPixiApp: !!leaves[0]?.view?.pixiApp,
      hasPixiNodes: !!leaves[0]?.view?.pixiNodes,
    };
  });

  expect(result.pluginLoaded).toBe(true);
  expect(result.leafCount).toBeGreaterThan(0);
  expect(result.hasPixiApp).toBe(true);
  expect(result.hasPixiNodes).toBe(true);
});

test("getGraphData returns nodes and edges from vault", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showOrphans = true;
    view.panel.showTags = true;
    view.panel.showTagNodes = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    return {
      nodeCount: gd.nodes.length,
      edgeCount: gd.edges.length,
      hasLabels: gd.nodes.some(n => n.label),
      hasEdgeTypes: gd.edges.some(e => e.type),
    };
  `));

  // Baseline: ~2354 nodes, ~5558 edges
  expect(result.nodeCount).toBeGreaterThan(1000);
  expect(result.edgeCount).toBeGreaterThan(2000);
  expect(result.hasLabels).toBe(true);
  expect(result.hasEdgeTypes).toBe(true);
});

test("showOrphans toggle changes visible node count", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showOrphans = true;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const withOrphans: any = await page.evaluate(ev(`
    return view.getGraphData().nodes.length;
  `));

  await page.evaluate(ev(`
    view.panel.showOrphans = false;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const withoutOrphans: any = await page.evaluate(ev(`
    return view.getGraphData().nodes.length;
  `));

  // Baseline: 23 orphans
  expect(withOrphans).toBeGreaterThan(withoutOrphans);
  console.log(`Orphans: with=${withOrphans}, without=${withoutOrphans}, diff=${withOrphans - withoutOrphans}`);
});

test("showTagNodes toggle changes node count by removing tag nodes", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "";
    view.panel.showTags = true;
    view.panel.showTagNodes = true;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const withTags: any = await page.evaluate(ev(`
    return view.getGraphData().nodes.length;
  `));

  await page.evaluate(ev(`
    view.panel.showTagNodes = false;
    view.rawData = null;
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const withoutTags: any = await page.evaluate(ev(`
    return view.getGraphData().nodes.length;
  `));

  expect(withTags).toBeGreaterThan(withoutTags);
  console.log(`TagNodes: with=${withTags}, without=${withoutTags}`);
});
