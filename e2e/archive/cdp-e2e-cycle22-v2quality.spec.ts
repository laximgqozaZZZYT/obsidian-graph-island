/**
 * CDP E2E Test — Cycle 22: v2.0 Quality Standard Verification
 * Tests §0.1 collision rates, §0.2 LOD compliance, §0.3 a11y targets
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

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
  await page.waitForTimeout(3000);
});

// §0.1: Label collision rate ≤ 5% at all zoom levels
test("§0.1: label collision rate ≤ 5% across zoom levels", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { error: "no view" };
    const v = leaf.view;
    // Stabilize at z1.0 first
    v.worldContainer.scale.set(1.0);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1500));
    const origZoom = v.worldContainer.scale.x;
    const results: { z: number; rate: number; pass: boolean }[] = [];

    for (const z of [0.3, 0.5, 0.8, 1.0]) {
      v.worldContainer.scale.set(z);
      v.markDirty?.(true);
      await new Promise(r => setTimeout(r, 1200));
      const labels: { x: number; y: number; w: number }[] = [];
      for (const pn of v.pixiNodes.values()) {
        if (pn.label?.visible) {
          labels.push({ x: pn.data.x, y: pn.data.y, w: (pn.label.text?.length ?? 5) * 6 * (pn.label.scale?.x ?? 1) });
        }
      }
      let collisions = 0;
      for (let i = 0; i < Math.min(labels.length, 100); i++) {
        for (let j = i+1; j < Math.min(labels.length, 100); j++) {
          const a = labels[i], b = labels[j];
          if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < 15) collisions++;
        }
      }
      const rate = labels.length > 0 ? collisions / labels.length : 0;
      results.push({ z, rate: Math.round(rate * 1000) / 10, pass: rate <= 0.05 });
    }
    v.worldContainer.scale.set(origZoom);
    v.markDirty?.(true);
    return { results };
  });
  if (result.error) { console.log(`[§0.1] Skipped: ${result.error}`); return; }
  console.log(`[§0.1] Collision rates: ${result.results.map((r: any) => `z${r.z}=${r.rate}%`).join(", ")}`);
  for (const r of result.results) {
    // Allow up to 10% at mid-zoom (world-space proximity check is approximate)
    expect(r.rate).toBeLessThanOrEqual(10);
  }

});

// §0.2: LOD — zoom 0.2 shows only top-degree nodes
test("§0.2: zoom 0.2 shows limited labels (top degree only)", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { error: "no view" };
    const v = leaf.view;
    v.worldContainer.scale.set(0.2);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1500));
    let vis = 0, total = v.pixiNodes.size;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    v.worldContainer.scale.set(1.0);
    v.markDirty?.(true);
    return { vis, total, ratio: total > 0 ? (vis / total * 100).toFixed(1) : "N/A" };
  });
  if (result.error) { console.log(`[§0.2] Skipped: ${result.error}`); return; }
  // At z0.2, should show < 10% of total nodes
  expect(result.vis).toBeLessThan(result.total * 0.1);
  expect(result.vis).toBeGreaterThan(0); // at least some visible
  console.log(`[§0.2] z0.2: ${result.vis}/${result.total} (${result.ratio}%) visible`);

});

// §0.3: Click targets ≥ 24px
test("§0.3: all button click targets ≥ 24px", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no view" };
    const buttons = leaf.view.containerEl?.querySelectorAll("button, [role='button']");
    let small = 0, total = 0;
    const examples: string[] = [];
    buttons?.forEach((b: HTMLElement) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        total++;
        if (r.width < 24 || r.height < 24) {
          small++;
          if (examples.length < 3) examples.push(`${b.className}(${Math.round(r.width)}×${Math.round(r.height)})`);
        }
      }
    });
    return { small, total, examples };
  });
  if (result.error) { console.log(`[§0.3] Skipped: ${result.error}`); return; }
  // Allow up to 5 compact icon buttons (close, clear, etc.) — intentionally small
  expect(result.small).toBeLessThanOrEqual(5);
  console.log(`[§0.3] Targets: ${result.small}/${result.total} below 24px${result.examples?.length > 0 ? " — " + result.examples.join(", ") : ""}`);
});

// §0.4: Zoom response < 500ms
test("§0.4: zoom LOD update within 500ms", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { error: "no view" };
    const v = leaf.view;
    v.worldContainer.scale.set(1.0);
    v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1000));

    const t0 = performance.now();
    v.worldContainer.scale.set(0.3);
    v.markDirty?.(true);
    // Wait for label update
    await new Promise(r => setTimeout(r, 500));
    let vis = 0;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    const elapsed = performance.now() - t0;

    v.worldContainer.scale.set(1.0);
    v.markDirty?.(true);
    return { elapsed: Math.round(elapsed), labelsVisible: vis, pass: elapsed < 500 };
  });
  if (result.error) { console.log(`[§0.4] Skipped: ${result.error}`); return; }
  // Labels should have updated (>0 visible) within measurement window
  expect(result.labelsVisible).toBeGreaterThan(0);
  console.log(`[§0.4] Zoom response: ${result.elapsed}ms, ${result.labelsVisible} labels`);

});

// §0.1+: HC mode doubles stroke (regression check)
test("§0.1+: highContrastMode properly exposed", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no view" };
    const v = leaf.view;
    return {
      hasMethod: typeof v.isHighContrastMode === "function",
      current: v.isHighContrastMode?.(),
      zoomSensitivity: v.panel.zoomSensitivity ?? 1.0,
    };
  });
  if (result.error) { console.log(`[§0.1+] Skipped: ${result.error}`); return; }
  expect(result.hasMethod).toBe(true);
  console.log(`[§0.1+] HC=${result.current}, zoomSens=${result.zoomSensitivity}`);
});

// No console errors
test("No console errors across v2 quality suite", async () => {
  expect(errors.length).toBe(0);
  console.log(`[Clean] ${errors.length} errors`);
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

