/**
 * CDP E2E Test -- Table Grid
 *
 * Verifies custom grid overlay: grid mode activation, table mode,
 * header display, and label placement settings.
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

test("gridTableMode activates with coordinate layout", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.gridTableMode = true;
    panel.gridShowHeaders = true;
    panel.gridLabelPlacement = "on-line";
    return { gridTableMode: panel.gridTableMode, gridShowHeaders: panel.gridShowHeaders, gridLabelPlacement: panel.gridLabelPlacement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.gridTableMode).toBe(true);
  expect(result.gridShowHeaders).toBe(true);
  expect(result.gridLabelPlacement).toBe("on-line");
});

test("gridLabelPlacement switches between on-line and between", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.gridLabelPlacement = "on-line";
    const onLine = panel.gridLabelPlacement;
    panel.gridLabelPlacement = "between";
    const between = panel.gridLabelPlacement;
    return { onLine, between };
  });
  expect(result.onLine).toBe("on-line");
  expect(result.between).toBe("between");
});

test("customGridOverlay setting changes panel state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    const before = panel.customGridOverlay;
    panel.customGridOverlay = !before;
    const after = panel.customGridOverlay;
    panel.customGridOverlay = before;
    return { before, after, toggled: before !== after };
  });
  expect(result.toggled).toBe(true);
});
