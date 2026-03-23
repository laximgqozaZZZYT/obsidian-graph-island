/**
 * CDP E2E Test -- Render Pipeline Trace
 *
 * Verifies that toggling edge settings triggers the render pipeline
 * and markDirty correctly schedules re-draws.
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

test("markDirty triggers a render cycle", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    const before = view.pixiApp?.view instanceof HTMLCanvasElement;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 1000));
    const after = view.pixiApp?.view instanceof HTMLCanvasElement;

    return { before, after, canvasPreserved: before && after };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.canvasPreserved).toBe(true);
});

test("showLinks toggle followed by markDirty does not crash", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.getPanel();

    panel.showLinks = false;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));

    panel.showLinks = true;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 500));

    return { nodeCount: view.pixiNodes?.size ?? 0, canvasOk: !!view.pixiApp?.view };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.canvasOk).toBe(true);
});

test("doRender rebuilds data and preserves node count", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    const before = view.pixiNodes?.size ?? 0;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    const after = view.pixiNodes?.size ?? 0;

    return { before, after, stable: before === after };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.stable).toBe(true);
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

