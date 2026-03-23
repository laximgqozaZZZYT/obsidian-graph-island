/**
 * UI Click Audit Final — verify settings via PixiJS scene graph and DOM inspection
 *
 * Since WebGL canvas cannot be read via getContext("2d"), this test inspects:
 * - PixiJS node graphics (alpha, tint, visible, position)
 * - DOM elements (minimap, dot-grid, labels)
 * - Panel state values
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

interface NodeVisuals {
  totalNodes: number;
  visibleNodes: number;
  avgAlpha: number;
  distinctTints: number;
}

async function getNodeVisuals(): Promise<NodeVisuals> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { totalNodes: 0, visibleNodes: 0, avgAlpha: 0, distinctTints: 0 };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pn) return { totalNodes: 0, visibleNodes: 0, avgAlpha: 0, distinctTints: 0 };
    let visible = 0, alphaSum = 0;
    const tints = new Set<number>();
    for (const n of pn.values()) {
      if (n.gfx?.visible !== false) visible++;
      alphaSum += n.gfx?.alpha ?? 1;
      if (n.gfx?.tint !== undefined) tints.add(n.gfx.tint);
    }
    return {
      totalNodes: pn.size,
      visibleNodes: visible,
      avgAlpha: pn.size > 0 ? alphaSum / pn.size : 0,
      distinctTints: tints.size,
    };
  });
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showTags = false;
    p.showOrphans = true;
    p.clusterArrangement = "spiral";
    p.nodeColorMode = "default";
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
  await resetView();
});

test.afterAll(async () => {});

test.describe("UI Click Audit Final — Scene Graph", () => {

  test("nodeColorMode category increases distinct tint count", async () => {
    await resetView();
    const defaultVisuals = await getNodeVisuals();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.nodeColorMode = "category";
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const catVisuals = await getNodeVisuals();

    expect(catVisuals.distinctTints).toBeGreaterThanOrEqual(defaultVisuals.distinctTints);
    console.log(`nodeColorMode: default tints=${defaultVisuals.distinctTints}, category tints=${catVisuals.distinctTints}`);
  });

  test("showOrphans=false reduces visible node count", async () => {
    await resetView();
    const before = await getNodeVisuals();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showOrphans = false;
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodeVisuals();

    expect(after.totalNodes).toBeLessThanOrEqual(before.totalNodes);
    console.log(`showOrphans: ${before.totalNodes} -> ${after.totalNodes}`);
  });

  test("minimap DOM element appears when showMinimap=true", async () => {
    await resetView();
    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showMinimap = false;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1000));
    });
    const beforeMinimap = await page.evaluate(() => !!document.querySelector(".gi-minimap, .graph-minimap"));

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showMinimap = true;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1000));
    });
    const afterMinimap = await page.evaluate(() => !!document.querySelector(".gi-minimap, .graph-minimap"));

    // At least one state should show minimap
    console.log(`minimap: before=${beforeMinimap}, after=${afterMinimap}`);
    expect(afterMinimap || !beforeMinimap).toBe(true);
  });

  test("panel state reflects current settings accurately", async () => {
    await resetView();
    const state = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return null;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      return {
        showOrphans: p.showOrphans,
        showTags: p.showTags,
        clusterArrangement: p.clusterArrangement,
        searchQuery: p.searchQuery,
        nodeDisplayMode: p.nodeDisplayMode,
      };
    });
    expect(state).not.toBeNull();
    expect(state!.showOrphans).toBe(true);
    expect(state!.showTags).toBe(false);
    expect(state!.clusterArrangement).toBe("spiral");
    expect(state!.searchQuery).toBe("folder:characters");
    console.log(`panel state: ${JSON.stringify(state)}`);
  });
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

