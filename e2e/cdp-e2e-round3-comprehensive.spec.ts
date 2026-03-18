/**
 * CDP E2E Test -- Round 3 Comprehensive
 *
 * Verifies export functionality, node display modes, search filtering,
 * and edge rendering stability.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test("export state preserves panel configuration", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const state = view.getState?.();
    return { hasState: !!state, hasPanel: !!state?.panel, arrangement: state?.panel?.clusterArrangement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasState).toBe(true);
  expect(result.hasPanel).toBe(true);
});

test("card mode renders with node count preserved", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    const before = view.pixiNodes?.size ?? 0;
    panel.nodeDisplayMode = "card";
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));
    const after = view.pixiNodes?.size ?? 0;
    panel.nodeDisplayMode = "node";
    view.markDirty?.();
    return { before, after, preserved: before === after };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.preserved).toBe(true);
});

test("search query path:classic-macbeth filters to ~172 nodes", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.searchQuery = "path:classic-macbeth*";
    panel.groupBy = "none";
    panel.showOrphans = true;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const nodeCount = view.pixiNodes?.size ?? 0;
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    return { filtered: nodeCount };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.filtered).toBeGreaterThanOrEqual(100);
  expect(result.filtered).toBeLessThanOrEqual(250);
});

test("edge rendering is stable across multiple re-renders", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      view.markDirty?.();
      await new Promise(r => setTimeout(r, 1000));
      counts.push(view.graphEdges?.length ?? 0);
    }
    return { counts, stable: counts.every(c => c === counts[0]) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.stable).toBe(true);
});
