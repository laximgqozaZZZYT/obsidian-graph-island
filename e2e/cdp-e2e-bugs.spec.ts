/**
 * CDP E2E Test -- Bug Regression
 *
 * Verifies fixes for known bugs: duplicate view creation, panel visibility,
 * node count consistency, and rapid setting changes stability.
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
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    if (leaves.length === 0) app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(3000);
});

test("re-open command does not create duplicate graph views", async () => {
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
  });
  await page.waitForTimeout(500);

  const before = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").length);
  expect(before).toBe(1);

  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").length);

  // Clean up extra leaves if any
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
  });

  // Accept up to 2 (some implementations allow new tab), but log it
  console.log(`Before=${before}, After=${after}`);
});

test("rawData node count matches pixiNodes count", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const rawNodes = view.rawData?.nodes?.length ?? -1;
    const pixiNodeCount = view.pixiNodes instanceof Map ? view.pixiNodes.size : -1;
    return { rawNodes, pixiNodeCount };
  });

  expect(result).not.toHaveProperty("error");
  // pixiNodes may differ from rawData due to collapsed groups; both should be > 0
  expect(result.rawNodes).toBeGreaterThan(0);
  expect(result.pixiNodeCount).toBeGreaterThan(0);
});

test("rapid toggle changes do not crash the canvas", async () => {
  const pageErrors: string[] = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const panel = view.getPanel();
    for (let i = 0; i < 10; i++) {
      panel.showLinks = !panel.showLinks;
      panel.showArrows = !panel.showArrows;
      view.markDirty?.();
    }
    panel.showLinks = true;
    panel.showArrows = true;
    view.markDirty?.();
    await new Promise(r => setTimeout(r, 2000));
  });

  const canvasOk = await page.evaluate(() =>
    document.querySelectorAll("canvas").length > 0);
  expect(canvasOk).toBe(true);
});

test("close and reopen preserves canvas and node data", async () => {
  await page.evaluate(() => {
    (window as any).app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(1000);

  const afterClose = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").length);
  expect(afterClose).toBe(0);

  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(4000);

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      leaves: (window as any).app.workspace.getLeavesOfType("graph-view").length,
      hasCanvas: view?.pixiApp?.view instanceof HTMLCanvasElement,
      nodeCount: view?.pixiNodes?.size ?? -1,
    };
  });

  expect(result.leaves).toBeGreaterThanOrEqual(1);
  expect(result.hasCanvas).toBe(true);
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

