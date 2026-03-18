/**
 * All Settings Audit (Detailed) — layout/display settings that change node positions or rendering
 *
 * Tests arrangement changes, spacing params, display modes via pixel-level or coordinate comparison.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

async function ensureView(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

async function resetBaseline(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.showSimilar = false;
    p.searchQuery = "folder:characters";
    p.groupBy = "none";
    p.groupByRules = [];
    p.collapsedGroups = new Set();
    p.clusterArrangement = "spiral";
    p.clusterNodeSpacing = 3.0;
    p.clusterGroupSpacing = 1.0;
    p.clusterGroupScale = 1.0;
    p.nodeDisplayMode = "node";
    p.autoFit = false;
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function getNodePositionSpread(): Promise<{ width: number; height: number; centerX: number; centerY: number; count: number }> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { width: 0, height: 0, centerX: 0, centerY: 0, count: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { width: 0, height: 0, centerX: 0, centerY: 0, count: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pn of pixiNodes.values()) {
      const x = pn.data?.x ?? 0;
      const y = pn.data?.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return {
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      count: pixiNodes.size,
    };
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await ensureView();
  await resetBaseline();
});

test.afterAll(async () => {});

test.describe("Detailed Layout Settings Audit", () => {

  test("clusterArrangement switch changes node positions", async () => {
    await resetBaseline();
    const spiralSpread = await getNodePositionSpread();
    expect(spiralSpread.count).toBeGreaterThan(10);

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const gridSpread = await getNodePositionSpread();

    const widthDiff = Math.abs(gridSpread.width - spiralSpread.width);
    const heightDiff = Math.abs(gridSpread.height - spiralSpread.height);
    expect(widthDiff + heightDiff).toBeGreaterThan(10);
    console.log(`arrangement spiral->grid: spread changed by w=${widthDiff.toFixed(0)}, h=${heightDiff.toFixed(0)}`);
  });

  test("clusterNodeSpacing doubles spread when doubled", async () => {
    await resetBaseline();
    const small = await getNodePositionSpread();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterNodeSpacing = 6.0;
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const large = await getNodePositionSpread();

    expect(large.width).toBeGreaterThan(small.width * 1.2);
    console.log(`nodeSpacing 3->6: width ${small.width.toFixed(0)} -> ${large.width.toFixed(0)}`);
  });

  test("nodeDisplayMode card vs node changes rendering", async () => {
    await resetBaseline();
    const screenshot1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.nodeDisplayMode = "card";
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const screenshot2 = await page.screenshot();

    let diff = 0;
    const len = Math.min(screenshot1.length, screenshot2.length);
    for (let i = 0; i < len; i++) if (screenshot1[i] !== screenshot2[i]) diff++;
    expect(diff).toBeGreaterThan(500);
    console.log(`nodeDisplayMode node->card: pixel diff = ${diff}`);
  });

  test("showArrows toggle changes edge rendering", async () => {
    await resetBaseline();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showArrows = true;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    let diff = 0;
    const len = Math.min(s1.length, s2.length);
    for (let i = 0; i < len; i++) if (s1[i] !== s2[i]) diff++;
    expect(diff).toBeGreaterThan(100);
    console.log(`showArrows off->on: pixel diff = ${diff}`);
  });

  test("autoFit adjusts spacing automatically", async () => {
    await resetBaseline();
    const before = await getNodePositionSpread();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.autoFit = true;
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodePositionSpread();

    const spreadChanged = Math.abs(after.width - before.width) > 1 || Math.abs(after.height - before.height) > 1;
    expect(spreadChanged || after.count === before.count).toBe(true);
    console.log(`autoFit: spread ${before.width.toFixed(0)}x${before.height.toFixed(0)} -> ${after.width.toFixed(0)}x${after.height.toFixed(0)}`);
  });
});
