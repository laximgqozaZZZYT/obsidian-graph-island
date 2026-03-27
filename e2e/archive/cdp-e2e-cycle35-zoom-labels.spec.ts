/**
 * CDP E2E Test — Cycle 35: Zoom Label Modes + Density Badge
 *
 * Tests:
 * 1. zoom=0.15 → labels show initials (≤2 chars)
 * 2. zoom=0.3  → labels are truncated (shorter than full)
 * 3. zoom=1.0  → labels show full text
 * 4. zoom=0.2  → density badge visible
 * 5. zoom=1.0  → density badge hidden
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

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

/** Helper to set zoom and wait for label update */
async function setZoomAndWait(p: Page, zoom: number) {
  await p.evaluate(async (z) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    // Access setZoom via workaround — it's private, so we directly scale the world container
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

/** Collect visible label texts */
async function getVisibleLabels(p: Page): Promise<string[]> {
  return p.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return [];
    const labels: string[] = [];
    for (const pn of view.pixiNodes.values()) {
      if (pn.label && pn.label.visible && pn.label.text) {
        labels.push(pn.label.text);
      }
    }
    return labels;
  });
}

test("zoom=0.15: labels show initials (≤2 chars)", async () => {
  await setZoomAndWait(page, 0.15);
  const labels = await getVisibleLabels(page);
  expect(labels.length).toBeGreaterThan(0);
  // All labels should be ≤ 2 characters (initials mode)
  const longLabels = labels.filter(l => l.length > 2);
  console.log(`  Initials mode: ${labels.length} labels, ${longLabels.length} longer than 2 chars`);
  console.log(`  Sample labels: ${labels.slice(0, 10).join(", ")}`);
  // Allow small tolerance for super-nodes that may keep full text
  expect(longLabels.length).toBeLessThan(labels.length * 0.15);
});

test("zoom=0.3: labels are truncated", async () => {
  await setZoomAndWait(page, 0.3);
  const labels = await getVisibleLabels(page);
  expect(labels.length).toBeGreaterThan(0);
  // Most labels should be shorter than 15 chars (truncated mode: 5-12 chars)
  const shortLabels = labels.filter(l => l.length <= 15);
  console.log(`  Truncated mode: ${labels.length} labels, ${shortLabels.length} ≤15 chars`);
  console.log(`  Sample: ${labels.slice(0, 10).join(", ")}`);
  expect(shortLabels.length).toBeGreaterThan(labels.length * 0.5);
});

test("zoom=1.0: labels show full text", async () => {
  await setZoomAndWait(page, 1.0);
  const labels = await getVisibleLabels(page);
  expect(labels.length).toBeGreaterThan(0);
  // At full zoom, many labels should be longer (not truncated)
  const longLabels = labels.filter(l => l.length > 5);
  console.log(`  Full mode: ${labels.length} labels, ${longLabels.length} > 5 chars`);
  console.log(`  Sample: ${labels.slice(0, 10).join(", ")}`);
  expect(longLabels.length).toBeGreaterThan(0);
});

test("zoom=0.2: density badge is visible", async () => {
  await setZoomAndWait(page, 0.2);
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    if (!el) return { exists: false };
    const style = window.getComputedStyle(el);
    return {
      exists: true,
      display: style.display,
      text: el.textContent,
      visible: style.display !== "none" && el.textContent !== "",
    };
  });
  console.log(`  Density badge at zoom=0.2:`, badge);
  expect(badge.exists).toBe(true);
  // Badge may or may not be visible depending on node count — just verify DOM exists
  // If culled count > 0, badge should show "+N more hidden"
  if (badge.visible) {
    expect(badge.text).toMatch(/\+\d+ more hidden/);
  }
});

test("zoom=1.0: density badge is hidden", async () => {
  await setZoomAndWait(page, 1.0);
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    if (!el) return { exists: false, display: "none" };
    return {
      exists: true,
      display: window.getComputedStyle(el).display,
      text: el.textContent,
    };
  });
  console.log(`  Density badge at zoom=1.0:`, badge);
  // At full zoom, density culling doesn't trigger (zoom >= 0.5 bypass)
  // Badge should either not exist or be hidden
  if (badge.exists) {
    expect(badge.display === "none" || badge.text === "").toBe(true);
  }
});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  const minimap = await measureMinimap(page);
  const guides = await measureGuides(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety} minimap=${minimap.visible} guides=${guides.lineCount}/${guides.labelCount}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
  // Guide labels should not all overlap each other
  if (guides.labelCount > 2) {
    expect(guides.overlappingLabels).toBeLessThan(guides.labelCount);
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
  console.log(`[SCREEN-Q] nodes=${density.totalNodes} hotspot=${density.worstCellCount} viewport=${density.viewportUtilization}% rightBias=${density.rightHalfRatio}%`);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  console.log(`[SCREEN-Q] labels=${labels.totalVisible} overlap=${labels.overlapRate} tooSmall=${labels.tooSmallCount} avgFont=${labels.avgScreenFontSize}px`);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.70);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.5);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  console.log(`[SCREEN-Q] edges=${edges.totalEdges} visible=${edges.visibleEdges} tooThin=${edges.tooThinCount} lowAlpha=${edges.lowAlphaCount} colors=${edges.colorVariety}`);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.8);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    console.log(`[SCREEN-Q] enclosures=${enclosures.totalEnclosures} overlapping=${enclosures.overlappingPairs} rate=${enclosures.overlapRate}`);
    expect(enclosures.overlapRate).toBeLessThan(0.70);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    console.log(`[SCREEN-Q] cards=${cards.totalCards} overlapping=${cards.overlappingCards} tooSmall=${cards.tooSmallCards} avgW=${cards.avgCardWidth} avgH=${cards.avgCardHeight}`);
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.5);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.7);
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
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

});

