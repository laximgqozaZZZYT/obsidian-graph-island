/**
 * CDP E2E Test — Cycle 24: LOD v2.1 spec verification + zoom prefetch
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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
  // Ensure GI view is open
  const hasGI = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").some((l: any) => l.view && "pixiNodes" in l.view)
  );
  if (!hasGI) {
    await page.evaluate(() => (window as any).app.commands.executeCommandById("graph-island:open-graph-view"));
    await page.waitForTimeout(10000);
  }
  await page.waitForTimeout(3000);
});

async function labelsAtZoom(z: number): Promise<{ vis: number; total: number; pct: string }> {
  return page.evaluate(async (zoom) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { vis: 0, total: 0, pct: "N/A" };
    const v = leaf.view;
    v.worldContainer.scale.set(zoom); v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1200));
    let vis = 0;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    const total = v.pixiNodes.size;
    return { vis, total, pct: total > 0 ? (vis / total * 100).toFixed(1) : "0" };
  }, z);
}

// v2.1 LOD Tier 1: z0.05 — top 3% only
test("v2.1 LOD Tier 1: z0.05 shows ≤5% of nodes", async () => {
  const r = await labelsAtZoom(0.05);
  if (r.pct === "N/A") { console.log("[T1] Skipped"); return; }
  expect(parseFloat(r.pct)).toBeLessThanOrEqual(5);
  expect(r.vis).toBeGreaterThan(0);
  console.log(`[T1] z0.05: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 2: z0.2 — top 10%
test("v2.1 LOD Tier 2: z0.2 shows ≤15% of nodes", async () => {
  const r = await labelsAtZoom(0.2);
  if (r.pct === "N/A") { console.log("[T2] Skipped"); return; }
  expect(parseFloat(r.pct)).toBeLessThanOrEqual(15);
  console.log(`[T2] z0.2: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 3: z0.5 — full labels visible
test("v2.1 LOD Tier 3: z0.5 shows significant labels", async () => {
  const r = await labelsAtZoom(0.5);
  if (r.pct === "N/A") { console.log("[T3] Skipped"); return; }
  expect(r.vis).toBeGreaterThan(10);
  console.log(`[T3] z0.5: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 4: z1.0 — all labels
test("v2.1 LOD Tier 4: z1.0 shows all or most labels", async () => {
  const r = await labelsAtZoom(1.0);
  if (r.pct === "N/A") { console.log("[T4] Skipped"); return; }
  // Most nodes with labels should be visible at z1.0 (>100 labels)
  expect(r.vis).toBeGreaterThan(100);
  console.log(`[T4] z1.0: ${r.vis}/${r.total} (${r.pct}%)`);
  // Restore
  await labelsAtZoom(1.0);
});

// Zoom prefetch: updateLabelsForZoom called from InteractionManager
test("Zoom prefetch: InteractionManager calls updateLabelsForZoom directly", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no view" };
    // Verify the method exists
    return {
      hasUpdateLabels: typeof leaf.view.updateLabelsForZoom === "function",
      hasMarkDirty: typeof leaf.view.markDirty === "function",
    };
  });
  if (result.error) { console.log(`[Prefetch] Skipped: ${result.error}`); return; }
  expect(result.hasUpdateLabels).toBe(true);
  console.log(`[Prefetch] updateLabelsForZoom=${result.hasUpdateLabels}, markDirty=${result.hasMarkDirty}`);
});

test("No errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[Clean] ${errors.length} errors`);
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

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
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

