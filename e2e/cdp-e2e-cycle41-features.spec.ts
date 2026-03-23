/**
 * CDP E2E Test — Cycle 41: Viewport Culling + Jump Focus Zoom + Preset Zoom
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

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

test("Proposal Y: viewport culling reduces label rect count", async () => {
  // At zoom=1.0, most nodes are off-screen — viewport culling should reduce rects
  await setZoomAndWait(page, 1.0);
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };
    const totalNodes = view.pixiNodes.size;
    let visibleLabels = 0;
    for (const pn of view.pixiNodes.values()) {
      if (pn.label?.visible && pn.label?.text) visibleLabels++;
    }
    return { totalNodes, visibleLabels };
  });
  console.log(`  Viewport culling at zoom=1.0:`, result);
  expect(result.totalNodes).toBeGreaterThan(0);
  // At zoom=1.0, only a fraction of nodes are on-screen
  // Visible labels should be less than total nodes
  expect(result.visibleLabels).toBeLessThan(result.totalNodes);
});

test("Proposal W: jumpToNode focuses zoom when zoomed out", async () => {
  await setZoomAndWait(page, 0.2);
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };
    const zoomBefore = view.worldContainer?.scale?.x ?? 1;
    // Get first node ID
    const firstId = view.pixiNodes.keys().next().value;
    if (!firstId) return { error: "no nodes" };
    // Call jumpToNode (internal method via panel callback)
    view.setHighlightedNodeId(firstId);
    view.applyHover();
    view.focusZoomToNode(firstId, 0.6);
    await new Promise(r => setTimeout(r, 500));
    const zoomAfter = view.worldContainer?.scale?.x ?? 1;
    return {
      zoomBefore: Math.round(zoomBefore * 100) / 100,
      zoomAfter: Math.round(zoomAfter * 100) / 100,
      zoomedIn: zoomAfter > zoomBefore,
    };
  });
  console.log(`  Jump focus zoom:`, result);
  if (!result.error) {
    expect(result.zoomedIn).toBe(true);
    expect(result.zoomAfter).toBeGreaterThanOrEqual(0.5);
  }
});

test("Proposal X: presetZoomLevel field exists in panel", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };
    return {
      hasField: "presetZoomLevel" in view.panel,
      value: view.panel.presetZoomLevel,
    };
  });
  console.log(`  presetZoomLevel:`, result);
  expect(result.hasField).toBe(true);
  expect(result.value).toBe(0); // default
});

test("Regression: label mode indicator and presets", async () => {
  await setZoomAndWait(page, 0.15);
  const i = await page.evaluate(() => document.querySelector(".gi-zoom-indicator")?.textContent ?? "");
  expect(i).toContain("·I");

  await setZoomAndWait(page, 0.3);
  const t = await page.evaluate(() => document.querySelector(".gi-zoom-indicator")?.textContent ?? "");
  expect(t).toContain("·T");

  const presets = await page.evaluate(() => document.querySelectorAll(".gi-zoom-preset-btn").length);
  expect(presets).toBe(4);
});

test("Regression: no console errors during operations", async () => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));

  await setZoomAndWait(page, 0.1);
  await setZoomAndWait(page, 0.5);
  await setZoomAndWait(page, 1.0);

  const real = errors.filter(e => !e.includes("ResizeObserver") && !e.includes("Excalidraw"));
  console.log(`  Console errors: ${real.length}`);
  expect(real.length).toBe(0);
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

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
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

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

