/**
 * Sparse Graph Audit v2 — verify rendering pipeline with invalidateData + doRender
 *
 * Tests that the full render pipeline correctly processes small datasets
 * and that switching between filter states produces correct results.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

async function applyAndCount(settings: Record<string, unknown>): Promise<{ nodeCount: number; edgeCount: number }> {
  return page.evaluate(async (s: Record<string, unknown>) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0 };
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") (p as any)[k] = new Set(v as string[]);
      else (p as any)[k] = v;
    }
    // Force full re-render
    view.rawData = null;
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2500));
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return { nodeCount: pn?.size ?? 0, edgeCount: edges.length };
  }, settings);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
});

test.afterAll(async () => {});

test.describe("Sparse Audit v2 — Full Pipeline", () => {

  test("full graph renders >2000 nodes", async () => {
    const result = await applyAndCount({
      searchQuery: "", showOrphans: true, showTags: true,
      showTagNodes: true, groupBy: "none", collapsedGroups: [],
    });
    expect(result.nodeCount).toBeGreaterThan(2000);
    expect(result.edgeCount).toBeGreaterThan(4000);
    console.log(`full: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  });

  test("characters folder filter gives controlled count", async () => {
    const result = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, showTagNodes: false, groupBy: "none", collapsedGroups: [],
    });
    expect(result.nodeCount).toBeGreaterThan(50);
    expect(result.nodeCount).toBeLessThan(500);
    console.log(`characters: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  });

  test("switching from sparse to full restores all nodes", async () => {
    // Go sparse
    const sparse = await applyAndCount({
      searchQuery: "path:classic-macbeth/characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    expect(sparse.nodeCount).toBeLessThan(100);

    // Go full
    const full = await applyAndCount({
      searchQuery: "", showOrphans: true, showTags: true,
      showTagNodes: true, groupBy: "none", collapsedGroups: [],
    });
    expect(full.nodeCount).toBeGreaterThan(2000);
    expect(full.nodeCount).toBeGreaterThan(sparse.nodeCount * 10);
    console.log(`sparse->full: ${sparse.nodeCount} -> ${full.nodeCount}`);
  });

  test("doRender produces consistent results on repeated calls", async () => {
    const r1 = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    const r2 = await applyAndCount({
      searchQuery: "folder:characters", showOrphans: true,
      showTags: false, groupBy: "none", collapsedGroups: [],
    });
    expect(r1.nodeCount).toBe(r2.nodeCount);
    expect(r1.edgeCount).toBe(r2.edgeCount);
    console.log(`consistency: ${r1.nodeCount}==${r2.nodeCount}, ${r1.edgeCount}==${r2.edgeCount}`);
  });
});
