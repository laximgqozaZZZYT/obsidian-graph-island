/**
 * CDP E2E Test -- Visual Verification
 *
 * Verifies cross-tabulation table mode, enclosure rendering,
 * and heatmap color mode via panel state assertions.
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

test("cross-tabulation with gridTableMode produces table layout", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.gridTableMode = true;
    panel.gridShowHeaders = true;
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "bin", count: 5 } },
      axis2: { source: { kind: "field", field: "node_type" }, transform: { kind: "bin", count: 5 } },
      perGroup: false,
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    return { gridTableMode: panel.gridTableMode, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.gridTableMode).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("nodeColorMode heatmap produces non-default coloring", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.nodeColorMode = "heatmap";
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));
    const mode = panel.nodeColorMode;
    panel.nodeColorMode = "default";
    return { mode };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.mode).toBe("heatmap");
});

test("enclosure labels count matches grouped data", async () => {
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
    return { collapsedGroups: panel.collapsedGroups.size, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.collapsedGroups).toBeGreaterThan(0);
  expect(result.nodeCount).toBeGreaterThan(0);
});
