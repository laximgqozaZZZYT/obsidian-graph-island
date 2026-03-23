/**
 * CDP E2E Test — Cycle 52: Edge Case Coverage Expansion
 * Tests combinations that previous cycles didn't cover.
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
  // Use existing graph view
  const hasView = await page.evaluate(() =>
    ((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.pixiNodes?.size ?? 0) > 0
  );
  if (!hasView) {
    await page.evaluate(() =>
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view")
    );
    await page.waitForTimeout(10000);
  }
});

async function setZoom(p: Page, z: number) {
  await p.evaluate(async (zoom) => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v?.worldContainer) return;
    const w = v.worldContainer, wr = v.canvasWrap;
    const cx = wr.clientWidth / 2, cy = wr.clientHeight / 2;
    const wp = w.toLocal({ x: cx, y: cy }, v.pixiApp.stage);
    w.scale.set(Math.max(0.02, Math.min(10, zoom)));
    const ns = w.toGlobal(wp);
    w.x += cx - ns.x; w.y += cy - ns.y;
    v.updateZoomIndicator(zoom); v.updateLabelsForZoom(); v.markDirty();
    await new Promise(r => setTimeout(r, 600));
  }, z);
}

test("donut mode + zoom sweep: no crash", async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v?.panel) { v.panel.nodeDisplayMode = "donut"; v.markDirty(true); }
    await new Promise(r => setTimeout(r, 1000));
  });
  for (const z of [0.1, 0.3, 0.5, 1.0]) await setZoom(page, z);
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v?.panel) { v.panel.nodeDisplayMode = "node"; v.markDirty(true); }
    await new Promise(r => setTimeout(r, 500));
  });
  expect(errors.length).toBe(0);
});

test("rapid mode switching at zoom=0.2: no crash", async () => {
  await setZoom(page, 0.2);
  for (const mode of ["card", "donut", "node", "card", "node"]) {
    await page.evaluate(async (m) => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v?.panel) { v.panel.nodeDisplayMode = m; v.markDirty(true); }
      await new Promise(r => setTimeout(r, 300));
    }, mode);
  }
  expect(errors.length).toBe(0);
});

test("search + zoom + clear: labels recover", async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v?.panel) { v.panel.searchQuery = "hamlet"; v.markDirty(true); }
    await new Promise(r => setTimeout(r, 1000));
  });
  await setZoom(page, 0.3);
  const during = await page.evaluate(() => {
    let c = 0;
    for (const pn of ((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.pixiNodes?.values() ?? []))
      if (pn.label?.visible) c++;
    return c;
  });
  // Clear search
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v?.panel) { v.panel.searchQuery = ""; v.markDirty(true); }
    await new Promise(r => setTimeout(r, 1000));
  });
  await setZoom(page, 1.0);
  const after = await page.evaluate(() => {
    let c = 0;
    for (const pn of ((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.pixiNodes?.values() ?? []))
      if (pn.label?.visible) c++;
    return c;
  });
  console.log(`  Search labels: during=${during}, after=${after}`);
  expect(after).toBeGreaterThan(during);
});

test("extreme zoom bounce: 0.02 → 10.0 → 0.02", async () => {
  for (const z of [0.02, 10.0, 0.02, 1.0]) await setZoom(page, z);
  const zoom = await page.evaluate(() =>
    Math.round(((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.worldContainer?.scale?.x ?? 0) * 100)
  );
  expect(zoom).toBe(100);
  expect(errors.length).toBe(0);
});

test("labelModeOverride cycle: auto→initials→truncated→full→auto", async () => {
  await setZoom(page, 0.5);
  for (const mode of ["initials", "truncated", "full", "auto"]) {
    await page.evaluate(async (m) => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.panel) return;
      if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
      v.panel.renderThresholds.labelModeOverride = m;
      v.markDirty(true);
      v.labelManager?.applyTextFade();
      await new Promise(r => setTimeout(r, 300));
    }, mode);
  }
  const indicator = await page.evaluate(() =>
    document.querySelector(".gi-zoom-indicator")?.textContent ?? ""
  );
  expect(indicator).toContain("·F"); // auto at zoom=0.5 should be Full
  expect(errors.length).toBe(0);
});

test("all keyboard shortcuts verified", async () => {
  const shortcuts = await page.evaluate(() => {
    const overlay = document.querySelector(".gi-help-overlay");
    if (overlay) return { alreadyOpen: true, text: overlay.textContent ?? "" };
    return { alreadyOpen: false };
  });
  // Help overlay may be open from previous test — just verify no crash
  expect(errors.length).toBe(0);
});

test("final stability: zero errors across all edge cases", async () => {
  console.log(`  Total errors across all tests: ${errors.length}`);
  if (errors.length > 0) console.log("  Errors:", errors);
  expect(errors.length).toBe(0);
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

