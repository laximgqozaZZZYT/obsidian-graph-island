/**
 * CDP E2E Test — Cycle 36: Card Mode + Zoom Quality
 *
 * Tests card display at various zoom levels, including:
 * - Card LOD transitions (extreme → mid → normal)
 * - Card hit-test accuracy after BUG A1 fix
 * - Density badge behavior in card mode
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

  // Reload to pick up latest main.js
  await page.evaluate(() => { location.reload(); });
  await page.waitForTimeout(5000);

  // Open graph view
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

test("card mode: LOD transitions at different zoom levels", async () => {
  // Switch to card mode via panel property + redraw
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    view.panel.nodeDisplayMode = "card";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 2000));
  });

  const results: Record<string, any> = {};

  for (const zoom of [0.03, 0.1, 0.3, 1.0]) {
    await setZoomAndWait(page, zoom);
    const info = await page.evaluate((z) => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf?.view;
      if (!view) return { error: "no view" };
      const zoom = view.worldContainer?.scale?.x ?? 1;
      const pixiNodes = view.pixiNodes;
      let visibleNodes = 0;
      let visibleLabels = 0;
      for (const pn of pixiNodes.values()) {
        if (pn.gfx?.visible !== false) visibleNodes++;
        if (pn.label?.visible && pn.label?.text) visibleLabels++;
      }
      return {
        zoom: Math.round(zoom * 100) / 100,
        visibleNodes,
        visibleLabels,
        totalNodes: pixiNodes.size,
      };
    }, zoom);
    results[`zoom_${zoom}`] = info;
    console.log(`  Card mode zoom=${zoom}:`, info);
  }

  // At all zoom levels, nodes should be visible
  for (const key of Object.keys(results)) {
    const r = results[key];
    if (r.error) continue;
    expect(r.visibleNodes).toBeGreaterThan(0);
  }

  // At zoom=1.0, labels should be visible
  expect(results["zoom_1"].visibleLabels).toBeGreaterThan(0);
});

test("card mode: hit-test matches visual bounds", async () => {
  await setZoomAndWait(page, 0.5);

  const hitTestResult = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };

    // Pick first visible node and check hit-test at its position
    let testNode: any = null;
    for (const pn of view.pixiNodes.values()) {
      if (pn.gfx?.visible !== false && pn.data.x !== undefined) {
        testNode = pn;
        break;
      }
    }
    if (!testNode) return { error: "no visible node" };

    // hitTestNode takes world coordinates
    const hitNode = view.hitTestNode(testNode.data.x, testNode.data.y);

    return {
      testNodeId: testNode.data.id,
      hitNodeId: hitNode?.data?.id ?? null,
      match: hitNode?.data?.id === testNode.data.id,
      worldX: Math.round(testNode.data.x),
      worldY: Math.round(testNode.data.y),
    };
  });

  console.log(`  Hit-test result:`, hitTestResult);
  if (!hitTestResult.error) {
    expect(hitTestResult.match).toBe(true);
  }
});

test("a11y: zoom indicator has aria attributes", async () => {
  const attrs = await page.evaluate(() => {
    const el = document.querySelector(".gi-zoom-indicator");
    if (!el) return { exists: false };
    return {
      exists: true,
      role: el.getAttribute("role"),
      ariaLive: el.getAttribute("aria-live"),
      text: el.textContent,
    };
  });
  console.log(`  Zoom indicator a11y:`, attrs);
  expect(attrs.exists).toBe(true);
  expect(attrs.role).toBe("status");
  expect(attrs.ariaLive).toBe("polite");
});

test("a11y: density badge has aria-live", async () => {
  const attrs = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    if (!el) return { exists: false };
    return {
      exists: true,
      ariaLive: el.getAttribute("aria-live"),
      ariaAtomic: el.getAttribute("aria-atomic"),
    };
  });
  console.log(`  Density badge a11y:`, attrs);
  expect(attrs.exists).toBe(true);
  expect(attrs.ariaLive).toBe("polite");
  expect(attrs.ariaAtomic).toBe("true");
});

test.afterAll(async () => {
  // Restore to normal node mode
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    view.panel.nodeDisplayMode = "node";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 1000));
  });
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

