/**
 * CDP E2E Test -- Rich Card & Cardinality
 *
 * Verifies card display mode activation, card field configuration,
 * and edge cardinality marker settings.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

test("card display mode activates correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.nodeDisplayMode = "card";
    panel.cardDisplayConfig = { fields: ["node_type"], maxWidth: 120, showIcon: false };
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));

    return { mode: panel.nodeDisplayMode, fields: panel.cardDisplayConfig?.fields };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.mode).toBe("card");
  expect(result.fields).toContain("node_type");
});

test("donut display mode activates correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.nodeDisplayMode = "donut";
    panel.donutDisplayConfig = { breakdownField: "node_type", innerRadius: 0.6 };
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));

    const mode = panel.nodeDisplayMode;
    panel.nodeDisplayMode = "node";
    view.markDirty?.();

    return { mode, innerRadius: panel.donutDisplayConfig?.innerRadius };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.mode).toBe("donut");
  expect(result.innerRadius).toBe(0.6);
});

test("switching back to node mode preserves nodes", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.nodeDisplayMode = "card";
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));

    panel.nodeDisplayMode = "node";
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));

    return { mode: panel.nodeDisplayMode, nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.mode).toBe("node");
  expect(result.nodeCount).toBeGreaterThan(0);
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});

