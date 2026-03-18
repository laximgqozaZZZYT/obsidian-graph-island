/**
 * Edge toggle verification — toggling edge types changes visible edge count
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);
let browser: Browser, page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  page = browser.contexts()[0].pages().find(p => p.url().includes("index.html")) ?? browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v) { v.panel.searchQuery = ""; v.panel.showOrphans = true; v.panel.clusterArrangement = "force"; v.rawData = null; v.doRender(); }
  });
  await page.waitForTimeout(6000);
});
test.afterAll(async () => {});

test("disabling showLinks hides link-type edges from rendering", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showLinks = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const allEdges = v.graphData?.edges?.length ?? 0;

    v.panel.showLinks = false;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withoutLinks = v.graphData?.edges?.length ?? 0;

    v.panel.showLinks = true;
    v.doRender();
    return { allEdges, withoutLinks };
  });
  expect(result).not.toBeNull();
  expect(result!.allEdges).toBeGreaterThan(result!.withoutLinks);
});

test("disabling showSimilar hides semantic-type edges", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return null;
    v.panel.showSimilar = true;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withSimilar = v.graphData?.edges?.length ?? 0;

    v.panel.showSimilar = false;
    v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withoutSimilar = v.graphData?.edges?.length ?? 0;

    v.panel.showSimilar = true;
    v.doRender();
    return { withSimilar, withoutSimilar };
  });
  expect(result).not.toBeNull();
  expect(result!.withSimilar).toBeGreaterThan(result!.withoutSimilar);
});
