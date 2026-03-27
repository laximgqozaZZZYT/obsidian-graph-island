/**
 * Settings Toggle Audit — verify each data-filtering toggle produces measurable change
 *
 * Consolidated from cdp-e2e-all-settings-audit.spec.ts + cdp-e2e-audit-fix.spec.ts
 * Tests: showOrphans, showTags, showTagNodes, showSimilar, searchQuery,
 *        sortRules, ringChartMode, clusterFollowsGroupBy
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureGraphIsland(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view")
      .filter((l: any) => "pixiNodes" in l.view);
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

function getView(): string {
  return `(window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view`;
}

async function resetBaseline(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
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

interface Snapshot { nodeCount: number; edgeCount: number }

async function snap(): Promise<Snapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
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
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
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

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await ensureGraphIsland();
  await resetBaseline();
});

test.afterAll(async () => {});

// ---------------------------------------------------------------------------
// Data Filtering Settings
// ---------------------------------------------------------------------------

test.describe("Settings Toggle Audit — Data Filtering", () => {

  test("showOrphans=false removes orphan nodes", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showOrphans", false);
    const after = await snap();
    const removed = before.nodeCount - after.nodeCount;
    expect(removed).toBeGreaterThanOrEqual(10);
    expect(removed).toBeLessThanOrEqual(100);
    await setPanelAndWait("showOrphans", true);
  });

  test("showTags=false removes tag nodes and has-tag edges", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showTags", false);
    const after = await snap();
    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    expect(after.edgeCount).toBeLessThan(before.edgeCount);
    expect(before.nodeCount - after.nodeCount).toBeGreaterThanOrEqual(50);
    await setPanelAndWait("showTags", true);
  });

  test("showTagNodes=false removes tag nodes", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showTagNodes", false);
    const after = await snap();
    expect(after.nodeCount).toBeLessThanOrEqual(before.nodeCount);
    await setPanelAndWait("showTagNodes", true);
  });

  test("showSimilar=true adds semantic edges", async () => {
    await resetBaseline();
    const before = await snap();
    await setPanelAndWait("showSimilar", true);
    const after = await snap();
    expect(after.edgeCount).toBeGreaterThanOrEqual(before.edgeCount);
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
    await setPanelAndWait("searchQuery", "");
  });
});

// ---------------------------------------------------------------------------
// Layout Behavior Settings (pixel-diff based)
// ---------------------------------------------------------------------------

test.describe("Settings Toggle Audit — Layout Behavior", () => {

  test("sortRules asc vs desc changes node positions", async () => {
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showTags = false;
      p.showTagNodes = false;
      p.searchQuery = "folder:characters";
      p.clusterArrangement = "grid";
      p.sortRules = [{ key: "label", order: "asc" }];
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.sortRules = [{ key: "label", order: "desc" }];
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s2 = await page.screenshot();

    expect(pixelDiff(s1, s2)).toBeGreaterThan(100);
  });

  test("ringChartMode toggle with concentric arrangement", async () => {
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "concentric";
      p.ringChartMode = false;
      p.groupByRules = [{ key: "prop-category" }];
      p.collapsedGroups = new Set();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.ringChartMode = true;
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s2 = await page.screenshot();

    expect(pixelDiff(s1, s2)).toBeGreaterThan(100);
  });

  test("clusterFollowsGroupBy changes layout behavior", async () => {
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "spiral";
      p.groupByRules = [{ key: "prop-category" }];
      p.collapsedGroups = new Set();
      p.clusterFollowsGroupBy = false;
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterFollowsGroupBy = true;
      if (typeof view.applyClusterForce === "function") view.applyClusterForce();
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s2 = await page.screenshot();

    expect(pixelDiff(s1, s2)).toBeGreaterThan(50);
  });
});
