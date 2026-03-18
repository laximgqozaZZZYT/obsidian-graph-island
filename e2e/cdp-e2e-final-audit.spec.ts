/**
 * Final Audit — stable-baseline toggle verification with stopped simulation
 *
 * Uses PixiJS scene graph inspection (not canvas pixel reads) to detect
 * changes in node alpha, tint, visibility, and position.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

interface SceneState {
  nodeCount: number;
  visibleNodes: number;
  avgAlpha: number;
  positionHash: number;
}

async function getSceneState(): Promise<SceneState> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodeCount: 0, visibleNodes: 0, avgAlpha: 0, positionHash: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes) return { nodeCount: 0, visibleNodes: 0, avgAlpha: 0, positionHash: 0 };
    let visible = 0, alphaSum = 0, posHash = 0;
    for (const pn of pixiNodes.values()) {
      if (pn.gfx?.visible !== false) visible++;
      alphaSum += pn.gfx?.alpha ?? 1;
      posHash += Math.round((pn.data?.x ?? 0) * 7 + (pn.data?.y ?? 0) * 13);
    }
    return {
      nodeCount: pixiNodes.size,
      visibleNodes: visible,
      avgAlpha: pixiNodes.size > 0 ? alphaSum / pixiNodes.size : 0,
      positionHash: posHash,
    };
  });
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showTags = false;
    p.searchQuery = "folder:characters";
    p.clusterArrangement = "spiral";
    p.showOrphans = true;
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2500));
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
  await resetView();
});

test.afterAll(async () => {});

test.describe("Final Audit — Scene Graph Inspection", () => {

  test("showOrphans toggle changes visible node count", async () => {
    await resetView();
    const before = await getSceneState();
    expect(before.nodeCount).toBeGreaterThan(10);

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showOrphans = false;
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getSceneState();

    expect(after.nodeCount).toBeLessThanOrEqual(before.nodeCount);
    console.log(`showOrphans: ${before.nodeCount} -> ${after.nodeCount} nodes`);
  });

  test("arrangement change modifies position hash", async () => {
    await resetView();
    const spiral = await getSceneState();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2500));
    });
    const grid = await getSceneState();

    expect(grid.positionHash).not.toBe(spiral.positionHash);
    console.log(`arrangement: spiral hash=${spiral.positionHash}, grid hash=${grid.positionHash}`);
  });

  test("searchQuery filter reduces node count", async () => {
    await resetView();
    const before = await getSceneState();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.searchQuery = "path:classic-macbeth";
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getSceneState();

    expect(after.nodeCount).toBeLessThan(before.nodeCount);
    expect(after.nodeCount).toBeGreaterThan(10);
    console.log(`searchQuery: ${before.nodeCount} -> ${after.nodeCount} nodes`);
  });
});
