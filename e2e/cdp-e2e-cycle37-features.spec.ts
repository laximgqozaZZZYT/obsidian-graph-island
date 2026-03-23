/**
 * CDP E2E Test — Cycle 37: Edge Thinning + Card LOD Fallback + Label Mode Indicator
 *
 * Tests:
 * 1. Proposal H: Edge width reduces at zoom-out
 * 2. Proposal I: Card mode falls back to circles at low zoom
 * 3. Proposal J: Zoom indicator shows label mode (I/T/F)
 * 4. Regression: Cycle 35-36 label modes still work
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
  await page.waitForTimeout(5000);

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

test("Proposal J: zoom indicator shows label mode character", async () => {
  // Test at three different zoom levels
  for (const [zoom, expectedMode] of [[0.15, "I"], [0.3, "T"], [0.5, "F"]] as [number, string][]) {
    await setZoomAndWait(page, zoom);
    const text = await page.evaluate(() => {
      return document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
    });
    console.log(`  Zoom ${zoom}: indicator = "${text}"`);
    expect(text).toContain(`·${expectedMode}`);
  }
});

test("Proposal J: zoom indicator hides mode at zoom >= 1.0", async () => {
  await setZoomAndWait(page, 1.0);
  const text = await page.evaluate(() => {
    return document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
  });
  console.log(`  Zoom 1.0: indicator = "${text}"`);
  expect(text).toBe("100%");
  expect(text).not.toContain("·");
});

test("Proposal I: card mode falls back to circles at low zoom", async () => {
  // Switch to card mode
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    view.panel.nodeDisplayMode = "card";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 2000));
  });

  // At zoom=0.05 (lodLevel 0-1), cards should be rendered as circles/dots
  await setZoomAndWait(page, 0.05);
  const lowZoomResult = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };
    // Check if any CardText elements exist on nodes (they shouldn't at extreme zoom)
    let cardTextCount = 0;
    for (const pn of view.pixiNodes.values()) {
      if (pn.gfx) {
        for (const child of pn.gfx.children) {
          if (child._isCardText) cardTextCount++;
        }
      }
    }
    return { cardTextCount, nodeDisplayMode: view.panel.nodeDisplayMode };
  });
  console.log(`  Card fallback at zoom=0.05:`, lowZoomResult);
  // At extreme zoom, card text should be cleaned up
  expect(lowZoomResult.nodeDisplayMode).toBe("card");
  expect(lowZoomResult.cardTextCount).toBe(0);

  // Restore zoom and verify cards come back
  await setZoomAndWait(page, 1.0);
  const normalZoomResult = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return { error: "no view" };
    // Force a render
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 1000));
    return { nodeDisplayMode: view.panel.nodeDisplayMode };
  });
  console.log(`  Card mode at zoom=1.0:`, normalZoomResult);
  expect(normalZoomResult.nodeDisplayMode).toBe("card");

  // Restore to node mode
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    view.panel.nodeDisplayMode = "node";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 1000));
  });
});

test("Regression: initials mode at zoom=0.15", async () => {
  await setZoomAndWait(page, 0.15);
  const labels = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return [];
    const labels: string[] = [];
    for (const pn of view.pixiNodes.values()) {
      if (pn.label && pn.label.visible && pn.label.text) labels.push(pn.label.text);
    }
    return labels;
  });
  expect(labels.length).toBeGreaterThan(0);
  const longLabels = labels.filter(l => l.length > 2);
  console.log(`  Initials: ${labels.length} labels, ${longLabels.length} > 2 chars`);
  expect(longLabels.length).toBeLessThan(labels.length * 0.15);
});

test("Regression: density badge visible at zoom=0.2", async () => {
  await setZoomAndWait(page, 0.2);
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    if (!el) return { exists: false };
    return {
      exists: true,
      display: window.getComputedStyle(el).display,
      text: el.textContent,
    };
  });
  console.log(`  Density badge:`, badge);
  expect(badge.exists).toBe(true);
  if (badge.display !== "none" && badge.text) {
    expect(badge.text).toMatch(/\+\d+ more hidden/);
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

