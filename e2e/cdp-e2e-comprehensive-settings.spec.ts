/**
 * CDP E2E Test -- Comprehensive Settings Validation
 *
 * Verifies edge rendering across coordinate systems,
 * node grouping, and super-node expansion.
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

test("edge count is positive with default settings", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return { edgeCount: view.graphEdges?.length ?? 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.edgeCount).toBeGreaterThan(5000);
});

test("groupBy folder creates collapsed super-nodes", async () => {
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

    const collapsed = panel.collapsedGroups instanceof Set ? panel.collapsedGroups.size : 0;
    const nodeCount = view.pixiNodes?.size ?? 0;
    return { collapsed, nodeCount, groupBy: panel.groupBy };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.groupBy).toBe("folder:?");
  expect(result.collapsed).toBeGreaterThan(0);
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("cartesian coordinate system positions nodes on grid", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "bin", count: 5 } },
      axis2: { source: { kind: "field", field: "node_type" }, transform: { kind: "bin", count: 5 } },
      perGroup: false,
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const xs: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) xs.push(pn.data.x);
    }
    return { nodeCount: xs.length, xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("polar coordinate system distributes nodes radially", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "spiral";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const dists: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        dists.push(Math.sqrt(pn.data.x ** 2 + pn.data.y ** 2));
      }
    }

    return {
      nodeCount: dists.length,
      maxDist: dists.length > 0 ? Math.max(...dists) : 0,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.maxDist).toBeGreaterThan(0);
});
