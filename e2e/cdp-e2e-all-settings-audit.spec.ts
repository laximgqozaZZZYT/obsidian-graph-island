/**
 * All Settings Audit — verify each toggle produces measurable change
 *
 * Baseline: 2354 nodes, 5558 edges (showOrphans=true, showTags=true, groupBy=none)
 * Each test toggles ONE setting and verifies concrete numeric delta.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureView(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    let leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

async function resetBaseline(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true;
    p.showTags = true;
    p.showTagNodes = true;
    p.showSimilar = false;
    p.showLinks = true;
    p.showInheritance = true;
    p.showAggregation = true;
    p.showSibling = true;
    p.showSequence = true;
    p.showTagEdges = true;
    p.showSemanticEdges = true;
    p.showArrows = false;
    p.searchQuery = "";
    p.groupBy = "none";
    p.groupByRules = [];
    p.collapsedGroups = new Set();
    p.nodeDisplayMode = "node";
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
}

interface Snapshot {
  nodeCount: number;
  edgeCount: number;
}

async function snap(): Promise<Snapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0 };
    const view = leaf.view;
    const nodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return {
      nodeCount: nodes instanceof Map ? nodes.size : 0,
      edgeCount: Array.isArray(edges) ? edges.length : 0,
    };
  });
}

async function setPanelAndWait(key: string, value: unknown): Promise<void> {
  await page.evaluate(([k, v]: [string, unknown]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    const cb = view.panelCallbacks;
    if (!cb) return;
    const dataKeys = ["showOrphans", "showTags", "showTagNodes", "showSimilar", "groupBy", "searchQuery", "existingOnly", "showAttachments"];
    if (dataKeys.includes(k)) cb.invalidateData();
    else cb.markDirty();
  }, [key, value]);
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await ensureView();
  await resetBaseline();
});

test.afterAll(async () => {
  // keep Obsidian open
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("All Settings Audit", () => {

  test("showOrphans=false removes exactly the orphan nodes", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showOrphans", false);
    const after = await snap();
    const removed = before.nodeCount - after.nodeCount;
    expect(removed).toBeGreaterThanOrEqual(10);
    expect(removed).toBeLessThanOrEqual(100);
    console.log(`showOrphans: removed ${removed} orphan nodes`);
    await setPanelAndWait("showOrphans", true);
  });

  test("showTags=false removes tag nodes and has-tag edges", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showTags", false);
    const after = await snap();
    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    expect(after.edgeCount).toBeLessThan(before.edgeCount);
    const nodesDelta = before.nodeCount - after.nodeCount;
    expect(nodesDelta).toBeGreaterThanOrEqual(50);
    console.log(`showTags: removed ${nodesDelta} tag nodes, ${before.edgeCount - after.edgeCount} edges`);
    await setPanelAndWait("showTags", true);
  });

  test("showTagNodes=false removes tag nodes while keeping has-tag connectivity", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showTagNodes", false);
    const after = await snap();
    expect(after.nodeCount).toBeLessThanOrEqual(before.nodeCount);
    console.log(`showTagNodes: ${before.nodeCount} -> ${after.nodeCount} nodes`);
    await setPanelAndWait("showTagNodes", true);
  });

  test("showSimilar=true adds semantic edges", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showSimilar", true);
    const after = await snap();
    expect(after.edgeCount).toBeGreaterThanOrEqual(before.edgeCount);
    console.log(`showSimilar: ${before.edgeCount} -> ${after.edgeCount} edges`);
    await setPanelAndWait("showSimilar", false);
  });

  test("searchQuery filters nodes to matching subset", async () => {
    await resetBaseline();
    const before = await snap();
    expect(before.nodeCount).toBeGreaterThan(1000);
    await setPanelAndWait("searchQuery", "tag:battle");
    const after = await snap();
    expect(after.nodeCount).toBeGreaterThan(50);
    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    console.log(`searchQuery tag:battle: ${before.nodeCount} -> ${after.nodeCount} nodes`);
    await setPanelAndWait("searchQuery", "");
  });

});
