/**
 * CDP E2E Test -- Full Node Dataset
 *
 * Verifies that the full 2354-node dataset loads correctly
 * with expected node count and edge distribution.
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

test("full dataset has approximately 2354 nodes", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.groupBy = "none";
    panel.groupByRules = [];
    panel.collapsedGroups = new Set();
    panel.showOrphans = true;
    panel.showTagNodes = true;
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    return { nodeCount: view.pixiNodes?.size ?? 0, edgeCount: view.graphEdges?.length ?? 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThanOrEqual(2300);
  expect(result.edgeCount).toBeGreaterThanOrEqual(5000);
});

test("orphan count matches baseline of 23", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    let orphans = 0;
    if (view.pixiNodes instanceof Map && view.degrees) {
      for (const [id] of view.pixiNodes) {
        if ((view.degrees.get(id) ?? 0) === 0) orphans++;
      }
    }
    return { orphans };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.orphans).toBeGreaterThanOrEqual(20);
  expect(result.orphans).toBeLessThanOrEqual(30);
});

test("showOrphans=false reduces displayed node count", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.showOrphans = true;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withOrphans = view.pixiNodes?.size ?? 0;

    panel.showOrphans = false;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withoutOrphans = view.pixiNodes?.size ?? 0;

    panel.showOrphans = true;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    return { withOrphans, withoutOrphans };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.withOrphans).toBeGreaterThan(result.withoutOrphans);
});
