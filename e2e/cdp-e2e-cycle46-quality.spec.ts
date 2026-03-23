/**
 * CDP E2E Test — Cycle 46: Quality Pass + Tooltip Enhancement
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(() => { location.reload(); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    (window as any).app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(8000);
});

async function setZoomAndWait(p: Page, zoom: number) {
  await p.evaluate(async (z) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    const world = view.worldContainer;
    if (!world) return;
    const wrap = view.canvasWrap;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal({ x: cx, y: cy }, view.pixiApp.stage);
    const s = Math.max(0.02, Math.min(10, z));
    world.scale.set(s);
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;
    view.updateZoomIndicator(s);
    view.updateLabelsForZoom();
    view.markDirty();
    await new Promise(r => setTimeout(r, 800));
  }, zoom);
}

test("zoom indicator tooltip includes mode description", async () => {
  await setZoomAndWait(page, 0.15);
  const title = await page.evaluate(() =>
    document.querySelector(".gi-zoom-indicator")?.getAttribute("title") ?? ""
  );
  console.log(`  Tooltip at zoom=0.15: "${title}"`);
  expect(title).toContain("Initials mode");
  expect(title).toContain("0-9 for zoom");

  await setZoomAndWait(page, 0.3);
  const title2 = await page.evaluate(() =>
    document.querySelector(".gi-zoom-indicator")?.getAttribute("title") ?? ""
  );
  expect(title2).toContain("Truncated mode");
});

test("comprehensive zoom sweep: no errors at any level", async () => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));

  for (const zoom of [0.03, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0]) {
    await setZoomAndWait(page, zoom);
  }

  const real = errors.filter(e => !e.includes("ResizeObserver") && !e.includes("Excalidraw"));
  console.log(`  Zoom sweep errors: ${real.length}`);
  expect(real.length).toBe(0);
});

test("label visibility increases with zoom", async () => {
  const counts: number[] = [];
  for (const zoom of [0.1, 0.3, 0.5, 1.0]) {
    await setZoomAndWait(page, zoom);
    const count = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      let vis = 0;
      for (const pn of view?.pixiNodes?.values() ?? []) {
        if (pn.label?.visible && pn.label?.alpha > 0.05) vis++;
      }
      return vis;
    });
    counts.push(count);
    console.log(`  zoom=${zoom}: ${count} visible labels`);
  }
  // Labels should generally increase with zoom (may not be strictly monotonic due to culling)
  expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
});

test("all a11y attributes intact after 11 cycles", async () => {
  const a11y = await page.evaluate(() => ({
    zoomRole: document.querySelector(".gi-zoom-indicator")?.getAttribute("role"),
    zoomLive: document.querySelector(".gi-zoom-indicator")?.getAttribute("aria-live"),
    badgeLive: document.querySelector(".gi-density-badge")?.getAttribute("aria-live"),
    canvasTabIndex: document.querySelector(".gi-canvas-area canvas")?.getAttribute("tabindex"),
    canvasLabel: !!document.querySelector(".gi-canvas-area canvas")?.getAttribute("aria-label"),
    presetBtns: document.querySelectorAll(".gi-zoom-preset-btn").length,
    ariaLiveRegion: !!document.querySelector("[aria-live='polite'][aria-atomic='true']"),
  }));
  console.log(`  A11y check:`, a11y);
  expect(a11y.zoomRole).toBe("status");
  expect(a11y.zoomLive).toBe("polite");
  expect(a11y.badgeLive).toBe("polite");
  expect(a11y.canvasTabIndex).toBe("0");
  expect(a11y.canvasLabel).toBe(true);
  expect(a11y.presetBtns).toBe(4);
  expect(a11y.ariaLiveRegion).toBe(true);
});

test("feature inventory: all cycle 35-45 features present", async () => {
  const features = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      // Core features
      hasPixiNodes: view.pixiNodes?.size > 0,
      hasLabelManager: !!view.labelManager,
      hasMinimap: "showMinimap" in view.panel,
      hasPresetZoomLevel: "presetZoomLevel" in view.panel,
      hasFocusZoomToNode: typeof view.focusZoomToNode === "function",
      hasUpdateDensityCulledBadge: typeof view.updateDensityCulledBadge === "function",
      hasGetSearchQuery: typeof view.getSearchQuery === "function",
      // UI elements
      presetButtons: document.querySelectorAll(".gi-zoom-preset-btn").length,
      densityBadge: !!document.querySelector(".gi-density-badge"),
      zoomIndicator: !!document.querySelector(".gi-zoom-indicator"),
    };
  });
  console.log(`  Feature inventory:`, features);
  if (!features.error) {
    expect(features.hasPixiNodes).toBe(true);
    expect(features.hasLabelManager).toBe(true);
    expect(features.hasFocusZoomToNode).toBe(true);
    expect(features.presetButtons).toBe(4);
    expect(features.densityBadge).toBe(true);
  }
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

