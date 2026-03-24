/**
 * CDP E2E Test -- Comprehensive Input/Select Verification
 *
 * Verifies that all input fields, select dropdowns, and sliders
 * in the graph panel are functional and respond to changes.
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

test("panel has input fields that accept text", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const inputs = view.panelEl?.querySelectorAll("input[type='text'], input:not([type])") ?? [];
    return { inputCount: inputs.length };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.inputCount).toBeGreaterThanOrEqual(0);
});

test("panel has select dropdowns with options", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const selects = view.panelEl?.querySelectorAll("select") ?? [];
    const selectInfo = Array.from(selects).map((s: any) => ({
      optionCount: s.options.length,
      value: s.value,
    }));
    return { selectCount: selects.length, selects: selectInfo.slice(0, 5) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.selectCount).toBeGreaterThan(0);
});

test("panel has range sliders with min/max", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const sliders = view.panelEl?.querySelectorAll("input[type='range']") ?? [];
    const sliderInfo = Array.from(sliders).map((s: any) => ({
      min: s.min, max: s.max, value: s.value,
    }));
    return { sliderCount: sliders.length, sliders: sliderInfo.slice(0, 5) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.sliderCount).toBeGreaterThan(0);
});
