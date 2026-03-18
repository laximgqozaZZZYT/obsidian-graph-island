/**
 * CDP E2E Test -- Obsidian Basic Smoke
 *
 * Verifies basic Obsidian integration: plugin registered, graph
 * view opens, and canvas renders with data.
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

test("graph-island plugin is registered in Obsidian", async () => {
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    return {
      hasPlugin: "graph-island" in (app?.plugins?.plugins ?? {}),
      hasManifest: !!app?.plugins?.manifests?.["graph-island"],
    };
  });
  expect(result.hasPlugin).toBe(true);
  expect(result.hasManifest).toBe(true);
});

test("graph view opens with canvas and renders nodes", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCanvas: view.pixiApp?.view instanceof HTMLCanvasElement,
      nodeCount: view.pixiNodes instanceof Map ? view.pixiNodes.size : -1,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCanvas).toBe(true);
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("vault has markdown files accessible via app.vault", async () => {
  const result = await page.evaluate(() => {
    const files = (window as any).app.vault.getMarkdownFiles();
    return { fileCount: files.length, samplePath: files[0]?.path ?? "" };
  });
  expect(result.fileCount).toBeGreaterThan(100);
  expect(result.samplePath).toContain(".md");
});
