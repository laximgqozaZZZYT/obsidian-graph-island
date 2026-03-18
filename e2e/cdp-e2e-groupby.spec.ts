/**
 * CDP E2E Test -- GroupBy
 *
 * Verifies groupBy creates correct number of groups,
 * collapsed groups are populated, and UI reflects grouping state.
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

test("tag:? grouping creates collapsed super-nodes", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "tag:?";
    panel.groupByRules = [{ field: "tag:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const collapsed = panel.collapsedGroups instanceof Set ? panel.collapsedGroups.size : 0;
    return { groupBy: panel.groupBy, collapsed, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.groupBy).toBe("tag:?");
  expect(result.collapsed).toBeGreaterThan(0);
});

test("folder:? grouping creates folder-based groups", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "folder:?";
    panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    return { groupBy: panel.groupBy, collapsed: panel.collapsedGroups.size, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.groupBy).toBe("folder:?");
  expect(result.collapsed).toBeGreaterThan(0);
});

test("groupBy none shows all nodes without grouping", async () => {
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

    return { groupBy: panel.groupBy, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.groupBy).toBe("none");
  expect(result.nodeCount).toBeGreaterThanOrEqual(2300);
});

test("changing groupBy from tag to folder alters collapsed group count", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.groupBy = "tag:?";
    panel.groupByRules = [{ field: "tag:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const tagGroups = panel.collapsedGroups.size;

    panel.groupBy = "folder:?";
    panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const folderGroups = panel.collapsedGroups.size;

    return { tagGroups, folderGroups };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.tagGroups).toBeGreaterThan(0);
  expect(result.folderGroups).toBeGreaterThan(0);
  expect(result.tagGroups).not.toBe(result.folderGroups);
});
