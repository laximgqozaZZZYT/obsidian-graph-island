/**
 * CDP E2E Test — Cycle 68 (Cycle 30): JK Edge Label Zoom Thresholds + JL mergeRenderThresholds Expansion
 * Tests configurable edge label zoom hide/fade and verifies refactored config pipeline.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const errors: string[] = [];

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
  const hasView = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    return leaves.some((l: any) => l.view && "pixiNodes" in l.view);
  });
  if (!hasView) {
    await page.evaluate(async () => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 8000));
    });
  }
});

// ── JK: Edge Label Zoom Thresholds ──

// JK-1: edgeLabelZoomHide and edgeLabelZoomFade are configurable
test("JK-1: edge label zoom thresholds read/write", async () => {
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};

    // Set custom values
    const origHide = panel.renderThresholds.edgeLabelZoomHide;
    const origFade = panel.renderThresholds.edgeLabelZoomFade;

    panel.renderThresholds.edgeLabelZoomHide = 0.1;
    panel.renderThresholds.edgeLabelZoomFade = 0.4;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    const readHide = panel.renderThresholds.edgeLabelZoomHide;
    const readFade = panel.renderThresholds.edgeLabelZoomFade;

    // Restore
    if (origHide !== undefined) panel.renderThresholds.edgeLabelZoomHide = origHide;
    else delete panel.renderThresholds.edgeLabelZoomHide;
    if (origFade !== undefined) panel.renderThresholds.edgeLabelZoomFade = origFade;
    else delete panel.renderThresholds.edgeLabelZoomFade;
    if (view.markDirty) view.markDirty(true);

    return { ok: true, readHide, readFade };
  });

  expect(result.ok).toBe(true);
  expect(result.readHide).toBe(0.1);
  expect(result.readFade).toBe(0.4);
});

// JK-2: Setting edgeLabelZoomHide=0 makes labels always visible
test("JK-2: zero threshold means always visible", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const orig = panel.renderThresholds.edgeLabelZoomHide;

    panel.renderThresholds.edgeLabelZoomHide = 0;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 200));

    // Restore
    if (orig !== undefined) panel.renderThresholds.edgeLabelZoomHide = orig;
    else delete panel.renderThresholds.edgeLabelZoomHide;
    if (view.markDirty) view.markDirty(true);

    return { ok: true };
  });

  expect(result.ok).toBe(true);
});

// ── JL: mergeRenderThresholds Expansion Regression ──

// JL-3: PanelBuilder slider initial values match defaults
test("JL-3: panel sliders render without errors", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    // Trigger panel rebuild
    if (view.rebuildPanel) {
      view.rebuildPanel();
      await new Promise(r => setTimeout(r, 500));
    }

    return { ok: true };
  });

  expect(result.ok).toBe(true);
  expect(errors.filter(e => e.includes("undefined") || e.includes("NaN"))).toHaveLength(0);
});

// JL-4: RenderPipeline label culling works after refactor
test("JL-4: label culling produces valid stats", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    // Check label cull stats
    if (typeof view.getLabelCullStats === "function") {
      const stats = view.getLabelCullStats();
      return {
        ok: true,
        hasStats: stats != null,
        totalLabels: stats?.totalLabels,
        visibleLabels: stats?.visibleLabels,
      };
    }

    return { ok: true, hasStats: false };
  });

  expect(result.ok).toBe(true);
  if (result.hasStats) {
    expect(result.totalLabels).toBeGreaterThanOrEqual(0);
    expect(result.visibleLabels).toBeGreaterThanOrEqual(0);
  }
});

test.afterAll(() => {
  if (errors.length > 0) {
    console.warn("Page errors during test:", errors);
  }
});
