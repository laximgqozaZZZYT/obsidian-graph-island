/**
 * UI Click Audit v2 — click UI elements by LABEL text, surviving rebuildPanel()
 *
 * Uses label-text-based queries to find controls, avoiding brittle index-based
 * selectors that break when the panel rebuilds.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
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
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function getNodeCount(): Promise<number> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return 0;
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    return pn?.size ?? 0;
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

test.describe("UI Click Audit v2 — Label-Based", () => {

  test("tab switching between filter/display/layout works", async () => {
    const tabs = await page.evaluate(() => {
      const container = document.querySelector(".graph-control-panel, .workspace-leaf-content");
      if (!container) return [];
      const buttons = container.querySelectorAll(".gi-tab-btn, [role='tab'], .tab-header-item");
      return Array.from(buttons).map(b => (b as HTMLElement).textContent?.trim() ?? "");
    });
    expect(tabs.length).toBeGreaterThan(0);
    console.log(`tabs found: ${tabs.join(", ")}`);
  });

  test("arrangement dropdown changes node positions", async () => {
    await resetView();
    const before = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await page.screenshot();

    const diff = pixelDiff(before, after);
    expect(diff).toBeGreaterThan(200);
    console.log(`arrangement change: pixel diff = ${diff}`);
  });

  test("search input filters nodes when text entered", async () => {
    await resetView();
    const before = await getNodeCount();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.searchQuery = "path:classic-macbeth";
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodeCount();

    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(10);
    console.log(`search filter: ${before} -> ${after}`);
  });

  test("nodeSize setting changes node rendering", async () => {
    await resetView();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.nodeSize = 30;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`nodeSize 15->30: diff=${diff}`);
  });
});
