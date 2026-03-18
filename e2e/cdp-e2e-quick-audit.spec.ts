/**
 * Quick Audit — fast sanity checks for core functionality
 *
 * Validates plugin load, view creation, node rendering, and basic data integrity.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
});

test.afterAll(async () => {});

test.describe("Quick Audit", () => {

  test("plugin is loaded and enabled", async () => {
    const info = await page.evaluate(() => {
      const app = (window as any).app;
      return {
        loaded: !!app?.plugins?.plugins?.["graph-island"],
        enabled: app?.plugins?.enabledPlugins?.has?.("graph-island") ?? false,
      };
    });
    expect(info.loaded).toBe(true);
    expect(info.enabled).toBe(true);
    console.log("plugin: loaded and enabled");
  });

  test("graph view opens and renders nodes", async () => {
    await page.evaluate(async () => {
      const app = (window as any).app;
      if (app.workspace.getLeavesOfType("graph-view").length === 0) {
        await app.commands.executeCommandById("graph-island:open-graph-view");
        await new Promise(r => setTimeout(r, 3000));
      }
    });

    const result = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { count: 0, hasCanvas: false };
      const view = leaf.view;
      const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
      const canvas = view.containerEl?.querySelector("canvas");
      return {
        count: pixiNodes?.size ?? 0,
        hasCanvas: !!canvas,
      };
    });

    expect(result.count).toBeGreaterThan(100);
    expect(result.hasCanvas).toBe(true);
    console.log(`view: ${result.count} nodes, canvas=${result.hasCanvas}`);
  });

  test("edge data contains expected types", async () => {
    const edgeTypes = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return {};
      const view = leaf.view;
      const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
      const types: Record<string, number> = {};
      for (const e of edges) {
        const t = e.type || "unknown";
        types[t] = (types[t] || 0) + 1;
      }
      return types;
    });

    expect(edgeTypes["link"]).toBeGreaterThan(100);
    console.log(`edge types: ${JSON.stringify(edgeTypes)}`);
  });

  test("panel state is accessible and has expected fields", async () => {
    const panelFields = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return [];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      return Object.keys(p).sort();
    });

    expect(panelFields).toContain("showOrphans");
    expect(panelFields).toContain("showTags");
    expect(panelFields).toContain("clusterArrangement");
    expect(panelFields).toContain("searchQuery");
    console.log(`panel has ${panelFields.length} fields`);
  });
});
