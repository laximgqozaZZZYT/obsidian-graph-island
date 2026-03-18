/**
 * CDP E2E Test -- Cable Bundle State
 *
 * Verifies cable bundle panel fields have correct defaults and
 * changing cableBundleMode updates the panel state.
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
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0)
      app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(4000);
});

test("cable bundle fields have correct default values", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    return {
      cableBundleMode: panel.cableBundleMode,
      cableTrunkWidth: panel.cableTrunkWidth,
      cableTrunkAlpha: panel.cableTrunkAlpha,
      cableSpacing: panel.cableSpacing,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.cableBundleMode).toBe("auto");
  expect(result.cableTrunkWidth).toBe(2);
  expect(result.cableTrunkAlpha).toBe(0.85);
  expect(result.cableSpacing).toBe(4);
});

test("setting cableBundleMode to never persists correctly", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    panel.cableBundleMode = "never";
    view.markDirty?.();
    return { mode: panel.cableBundleMode };
  });

  expect(result.mode).toBe("never");

  // Restore
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) { view.getPanel().cableBundleMode = "auto"; view.markDirty?.(); }
  });
});

test("modifying cableTrunkWidth updates the value", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    panel.cableTrunkWidth = 5;
    view.markDirty?.();
    const after = panel.cableTrunkWidth;
    panel.cableTrunkWidth = 2;
    view.markDirty?.();
    return { after };
  });

  expect(result.after).toBe(5);
});

test("total edges count is positive with cable settings", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return { totalEdges: view.graphEdges?.length ?? 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.totalEdges).toBeGreaterThan(0);
});
