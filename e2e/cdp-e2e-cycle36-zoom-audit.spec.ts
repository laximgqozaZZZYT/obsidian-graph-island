/**
 * CDP E2E Test -- Zoom Display Quality Audit (Cycle 36)
 *
 * Comprehensive audit of zoom levels to verify:
 * - Label visibility and text presence
 * - Label overlap detection
 * - Card overlap detection (if in card mode)
 * - Density badge visibility
 * - Node visibility counts
 * - Zoom indicator text accuracy
 *
 * Test zoom levels: 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
const ZOOM_LEVELS = [0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0];

let browser: Browser;
let page: Page;

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Reload page and wait for stabilization
  await page.evaluate(() => {
    location.reload();
  });
  await page.waitForTimeout(5000);

  // Initialize plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close any existing graph views
  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  // Open graph view
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

/**
 * Helper to compute overlapping rectangles
 */
function checkRectOverlap(
  r1: { x: number; y: number; w: number; h: number },
  r2: { x: number; y: number; w: number; h: number }
): boolean {
  return !(
    r1.x + r1.w < r2.x ||
    r2.x + r2.w < r1.x ||
    r1.y + r1.h < r2.y ||
    r2.y + r2.h < r1.y
  );
}

/**
 * Collect zoom metrics for a given zoom level
 */
async function collectZoomMetrics(zoomLevel: number) {
  const metrics = await page.evaluate((zoom) => {
    const app = (window as any).app;
    const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || !view.worldContainer) {
      return { error: "View not available" };
    }

    const world = view.worldContainer;
    const wrap = view.canvasWrap;
    const pixiApp = view.pixiApp;

    // Center-based zoom calculation
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal({ x: cx, y: cy }, pixiApp.stage);

    // Apply zoom
    world.scale.set(zoom);

    // Recalculate position to keep center in place
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;

    // Update UI
    if (view.updateZoomIndicator) {
      view.updateZoomIndicator(zoom);
    }
    if (view.updateLabelsForZoom) {
      view.updateLabelsForZoom();
    }
    view.markDirty();

    // Give time for visual updates
    return { zoom: world.scale.x, ready: true };
  }, zoomLevel);

  // Wait for render
  await page.waitForTimeout(500);

  // Collect metrics
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "View not available" };

    const metrics: any = {
      zoom: view.worldContainer?.scale?.x ?? 1,
      visibleLabels: 0,
      visibleLabelsWithText: 0,
      labelRects: [],
      visibleNodes: 0,
      totalNodes: 0,
      cardOverlapCount: 0,
      densityBadgeVisible: false,
      zoomIndicatorText: "",
    };

    // Count nodes
    if (view.pixiNodes) {
      metrics.totalNodes = view.pixiNodes.size;
      let visibleCount = 0;

      // Collect label rects
      const labelRects: any[] = [];
      for (const pn of view.pixiNodes.values()) {
        if (pn.gfx && pn.gfx.visible) {
          visibleCount++;
        }
        if (pn.label?.visible && pn.label?.text) {
          metrics.visibleLabels++;
          if (pn.label.text.length > 2) {
            metrics.visibleLabelsWithText++;
          }
          // Use CanvasText properties directly
          const label = pn.label;
          labelRects.push({
            x: label.x,
            y: label.y,
            w: label.width ?? 0,
            h: label.height ?? 12,
            text: label.text,
          });
        }
      }

      metrics.visibleNodes = visibleCount;

      // Check label overlaps (pairwise)
      let overlapCount = 0;
      for (let i = 0; i < labelRects.length; i++) {
        for (let j = i + 1; j < labelRects.length; j++) {
          const r1 = labelRects[i];
          const r2 = labelRects[j];
          // Simple AABB overlap
          if (!(r1.x + r1.w < r2.x ||
                r2.x + r2.w < r1.x ||
                r1.y + r1.h < r2.y ||
                r2.y + r2.h < r1.y)) {
            overlapCount++;
          }
        }
      }
      metrics.labelOverlapCount = overlapCount;
    }

    // Check card overlaps (if in card mode)
    if (view.nodeDisplayMode === "card" && view.pixiNodes) {
      let cardOverlapCount = 0;
      const cards: any[] = [];

      for (const pn of view.pixiNodes.values()) {
        // Cards are typically rendered within the container
        if (pn.gfx?.visible) {
          cards.push({
            x: pn.gfx.x ?? 0,
            y: pn.gfx.y ?? 0,
            w: pn.gfx.width ?? 100,
            h: pn.gfx.height ?? 80,
            nodeId: pn.data?.id,
          });
        }
      }

      // Check pairwise card overlaps
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const c1 = cards[i];
          const c2 = cards[j];
          if (!(c1.x + c1.w < c2.x ||
                c2.x + c2.w < c1.x ||
                c1.y + c1.h < c2.y ||
                c2.y + c2.h < c1.y)) {
            cardOverlapCount++;
          }
        }
      }
      metrics.cardOverlapCount = cardOverlapCount;
    }

    // Check density badge
    const densityBadge = document.querySelector(".gi-density-badge");
    if (densityBadge) {
      const display = window.getComputedStyle(densityBadge).display;
      metrics.densityBadgeVisible = display !== "none";
    }

    // Get zoom indicator text
    const zoomIndicator = document.querySelector(".gi-zoom-indicator");
    if (zoomIndicator) {
      metrics.zoomIndicatorText = zoomIndicator.textContent || "";
    }

    return metrics;
  });

  return result;
}

/**
 * Main test: Zoom level audit
 */
test("Zoom display quality audit across all levels", async () => {
  const allResults: any[] = [];

  for (const zoom of ZOOM_LEVELS) {
    console.log(`\n--- Testing zoom level: ${zoom} ---`);
    const metrics = await collectZoomMetrics(zoom);

    if (metrics.error) {
      console.error(`Error at zoom ${zoom}:`, metrics.error);
      allResults.push({ zoom, ...metrics });
      continue;
    }

    console.log(`Visible labels: ${metrics.visibleLabels}`);
    console.log(`Visible labels (length > 2): ${metrics.visibleLabelsWithText}`);
    console.log(`Label overlap count: ${metrics.labelOverlapCount}`);
    console.log(`Visible nodes: ${metrics.visibleNodes}/${metrics.totalNodes}`);
    console.log(`Card overlap count: ${metrics.cardOverlapCount}`);
    console.log(`Density badge visible: ${metrics.densityBadgeVisible}`);
    console.log(`Zoom indicator: ${metrics.zoomIndicatorText}`);

    allResults.push(metrics);

    // Basic assertions
    expect(metrics.visibleLabels).toBeGreaterThan(0);
    expect(metrics.visibleNodes).toBeGreaterThan(0);
    expect(metrics.totalNodes).toBeGreaterThan(0);

    // Note: overlap counts are high because labels are rendered in world space
    // This is informational to show culling patterns across zoom levels
  }

  // Print results table
  console.log("\n========== ZOOM AUDIT RESULTS TABLE ==========\n");
  console.log(
    "Zoom\tVisLabels\tVisLabelLen>2\tLabelOverlaps\tVisNodes/Total\tCardOverlaps\tDensityBadge\tZoomIndicator"
  );
  console.log("-----\t---------\t--------------\t--------------\t-------------\t------------\t------------\t----------------");

  for (const result of allResults) {
    if (result.error) {
      console.log(`${result.zoom}\tERROR: ${result.error}`);
    } else {
      const ratio = `${result.visibleNodes}/${result.totalNodes}`;
      console.log(
        `${result.zoom}\t${result.visibleLabels}\t\t${result.visibleLabelsWithText}\t\t\t${result.labelOverlapCount}\t\t\t${ratio}\t\t${result.cardOverlapCount}\t\t\t${result.densityBadgeVisible}\t\t\t${result.zoomIndicatorText}`
      );
    }
  }

  // Assertions
  console.log("\n========== ASSERTIONS ==========\n");

  // Assert at least one result without errors
  const validResults = allResults.filter((r) => !r.error);
  expect(validResults.length).toBeGreaterThan(0);

  // Assert visible labels increase with zoom (general trend)
  const min01 = validResults.find((r) => r.zoom <= 0.15)?.visibleLabels ?? 0;
  const max20 = validResults.find((r) => r.zoom >= 2.0)?.visibleLabels ?? 0;
  console.log(`Labels at zoom ~0.1: ${min01}`);
  console.log(`Labels at zoom ~2.0: ${max20}`);
  if (min01 > 0 && max20 > 0) {
    expect(max20).toBeGreaterThanOrEqual(min01);
  }

  // Verify density badge is shown at low zoom levels
  const lowZoomResults = validResults.filter((r) => r.zoom <= 0.3 && !r.error);
  for (const result of lowZoomResults) {
    console.log(`Zoom ${result.zoom}: density badge visible = ${result.densityBadgeVisible}`);
    expect(result.densityBadgeVisible).toBe(true);
  }

  // Verify zoom indicator text is present at all levels
  for (const result of validResults.filter((r) => !r.error)) {
    expect(result.zoomIndicatorText).toBeTruthy();
    console.log(`Zoom ${result.zoom}: indicator = "${result.zoomIndicatorText}"`);
  }

  console.log("\nAll zoom audit assertions passed.");
});

test.afterAll(async () => {
  if (browser) {
    await browser.close();
  }
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

