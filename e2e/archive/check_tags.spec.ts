/**
 * CDP E2E Test -- Tag Check
 *
 * Verifies that tag nodes exist in the graph data and
 * tag-related edges (has-tag) are present.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

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

test("tag nodes exist in graph data", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.showTagNodes = true;
    panel.groupBy = "none";
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    let tagNodes = 0;
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        if (pn.data.isTag) tagNodes++;
      }
    }
    return { tagNodes, totalNodes: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.tagNodes).toBeGreaterThan(0);
  expect(result.totalNodes).toBeGreaterThan(result.tagNodes);
});

test("has-tag edges connect file nodes to tag nodes", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const hasTagEdges = (view.graphEdges ?? []).filter((e: any) => e.type === "has-tag").length;
    return { hasTagEdges };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasTagEdges).toBeGreaterThan(200);
});
