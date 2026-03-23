/**
 * CDP E2E Test -- Remaining Untested Settings
 *
 * Verifies settings not covered by other tests: guideLineMode,
 * showGuideLines, showGroupGrid, showDotGrid, enclosureSpacing.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

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

test("guideLineMode changes between shared and per-group", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    panel.guideLineMode = "shared";
    const shared = panel.guideLineMode;
    panel.guideLineMode = "per-group";
    const perGroup = panel.guideLineMode;
    return { shared, perGroup };
  });
  expect(result.shared).toBe("shared");
  expect(result.perGroup).toBe("per-group");
});

test("showGuideLines toggle persists state", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.showGuideLines;
    panel.showGuideLines = !before;
    const after = panel.showGuideLines;
    panel.showGuideLines = before;
    return { toggled: before !== after };
  });
  expect(result.toggled).toBe(true);
});

test("enclosureSpacing accepts numeric values", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    const before = panel.enclosureSpacing;
    panel.enclosureSpacing = 3.0;
    const after = panel.enclosureSpacing;
    panel.enclosureSpacing = before;
    return { before, after };
  });
  expect(result.after).toBe(3.0);
});

test("showDotGrid and showGroupGrid are independent toggles", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();
    panel.showDotGrid = true;
    panel.showGroupGrid = false;
    const dot = panel.showDotGrid;
    const group = panel.showGroupGrid;
    return { dot, group };
  });
  expect(result.dot).toBe(true);
  expect(result.group).toBe(false);
});

// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }
});

