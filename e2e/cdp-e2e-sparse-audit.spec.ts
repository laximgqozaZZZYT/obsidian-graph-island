/**
 * Sparse Graph Audit — filter to small node set and verify edge visibility
 *
 * Uses a tight search query to get ~20-50 nodes where individual edges
 * are distinguishable, then tests edge visibility toggles.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

interface SparseSnapshot {
  nodeCount: number;
  edgeCount: number;
  edgeTypes: Record<string, number>;
  nodeIds: string[];
}

async function getSparseSnapshot(): Promise<SparseSnapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0, edgeTypes: {}, nodeIds: [] };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    const types: Record<string, number> = {};
    for (const e of edges) types[e.type || "unknown"] = (types[e.type || "unknown"] || 0) + 1;
    const ids: string[] = [];
    if (pn) for (const id of pn.keys()) ids.push(id);
    return { nodeCount: pn?.size ?? 0, edgeCount: edges.length, edgeTypes: types, nodeIds: ids.slice(0, 10) };
  });
}

async function setupSparse(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "path:classic-macbeth/characters";
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.showSimilar = false;
    p.showLinks = true;
    p.showSemanticEdges = true;
    p.showTagEdges = false;
    p.clusterArrangement = "spiral";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
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
  await setupSparse();
});

test.afterAll(async () => {});

test.describe("Sparse Graph Audit", () => {

  test("sparse filter produces manageable node count", async () => {
    await setupSparse();
    const s = await getSparseSnapshot();
    expect(s.nodeCount).toBeGreaterThan(5);
    expect(s.nodeCount).toBeLessThan(200);
    console.log(`sparse: ${s.nodeCount} nodes, ${s.edgeCount} edges`);
    console.log(`  types: ${JSON.stringify(s.edgeTypes)}`);
  });

  test("showLinks=false removes link edges in sparse graph", async () => {
    await setupSparse();
    const before = await getSparseSnapshot();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showLinks = false;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    let diff = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(50);
    console.log(`showLinks off in sparse: pixel diff=${diff}`);

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showLinks = true;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1000));
    });
  });

  test("all nodes have finite positions in sparse graph", async () => {
    await setupSparse();
    const stats = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { count: 0, finite: 0, nan: 0 };
      const view = leaf.view;
      const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
      let finite = 0, nan = 0;
      for (const n of pn.values()) {
        const x = n.data?.x, y = n.data?.y;
        if (isFinite(x) && isFinite(y)) finite++;
        else nan++;
      }
      return { count: pn.size, finite, nan };
    });
    expect(stats.nan).toBe(0);
    expect(stats.finite).toBe(stats.count);
    console.log(`sparse positions: ${stats.finite}/${stats.count} finite`);
  });
});
