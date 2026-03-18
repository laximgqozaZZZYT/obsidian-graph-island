/**
 * Settings Audit Live — tests each panel setting individually via CDP
 *
 * For data-filtering settings: compare node/edge counts.
 * For rendering-only settings: compare pixel hash of canvas.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface Snapshot { nodeCount: number; edgeCount: number; }

async function snap(): Promise<Snapshot> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, edgeCount: 0 };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return { nodeCount: pn?.size ?? 0, edgeCount: edges.length };
  });
}

async function resetBaseline(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true; p.showTags = true; p.showTagNodes = true;
    p.showSimilar = false; p.showLinks = true; p.showSemanticEdges = true;
    p.showTagEdges = true; p.searchQuery = ""; p.groupBy = "none";
    p.groupByRules = []; p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function setAndWait(key: string, value: unknown, cb: "data" | "dirty" = "data"): Promise<void> {
  await page.evaluate(async ([k, v, c]: [string, unknown, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (c === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1500));
  }, [key, value, cb]);
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
  await resetBaseline();
});

test.afterAll(async () => {});

test.describe("Settings Audit Live", () => {

  test("showOrphans=false reduces node count by orphan amount", async () => {
    await resetBaseline();
    const before = await snap();
    await setAndWait("showOrphans", false);
    const after = await snap();
    const removed = before.nodeCount - after.nodeCount;
    expect(removed).toBeGreaterThanOrEqual(10);
    console.log(`showOrphans: -${removed} nodes`);
    await setAndWait("showOrphans", true);
  });

  test("showTags=false removes tag nodes and reduces edges", async () => {
    await resetBaseline();
    const before = await snap();
    await setAndWait("showTags", false);
    const after = await snap();
    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    expect(after.edgeCount).toBeLessThan(before.edgeCount);
    console.log(`showTags: nodes ${before.nodeCount}->${after.nodeCount}, edges ${before.edgeCount}->${after.edgeCount}`);
    await setAndWait("showTags", true);
  });

  test("searchQuery=tag:battle filters to battle-related nodes", async () => {
    await resetBaseline();
    const before = await snap();
    await setAndWait("searchQuery", "tag:battle");
    const after = await snap();
    expect(after.nodeCount).toBeGreaterThan(50);
    expect(after.nodeCount).toBeLessThan(500);
    console.log(`searchQuery tag:battle: ${before.nodeCount}->${after.nodeCount}`);
    await setAndWait("searchQuery", "");
  });

  test("existingOnly=true filters unresolved links", async () => {
    await resetBaseline();
    const before = await snap();
    await setAndWait("existingOnly", true);
    const after = await snap();
    expect(after.nodeCount).toBeLessThanOrEqual(before.nodeCount);
    console.log(`existingOnly: ${before.nodeCount}->${after.nodeCount}`);
    await setAndWait("existingOnly", false);
  });
});
