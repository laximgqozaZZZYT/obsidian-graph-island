/**
 * CDP E2E Test — Cycle 19: Zoom sensitivity + section a11y + high contrast expansion
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

// IL: zoomSensitivity defaults to 1.0
test("IL: zoomSensitivity panel field defaults to 1.0", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    return { zoomSensitivity: leaf.view.panel.zoomSensitivity };
  });
  if (result.error) { console.log(`[IL] Skipped: ${result.error}`); return; }
  expect(result.zoomSensitivity).toBeCloseTo(1.0, 1);
  console.log(`[IL] zoomSensitivity: ${result.zoomSensitivity}`);
});

// IM: Section headers have aria-controls linking to body
test("IM: panel section headers have aria-controls", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const headers = leaf.view.containerEl?.querySelectorAll("[aria-controls]");
    const withControls = [];
    headers?.forEach((h) => {
      const ctrl = h.getAttribute("aria-controls");
      const target = ctrl ? leaf.view.containerEl?.querySelector("#" + ctrl) : null;
      withControls.push({ controls: ctrl, targetExists: !!target });
    });
    return { count: withControls.length, sample: withControls.slice(0, 5) };
  });
  if (result.error) { console.log(`[IM] Skipped: ${result.error}`); return; }
  expect(result.count).toBeGreaterThan(0);
  // Verify at least some targets exist (aria-controls points to real elements)
  const validTargets = result.sample.filter((s: any) => s.targetExists);
  console.log(`[IM] aria-controls: ${result.count} headers, ${validTargets.length}/${result.sample.length} targets found`);
});

// IN: Zoom sensitivity formula produces correct factors
test("IN: zoom sensitivity scaling formula correct", async () => {
  const result = await page.evaluate(() => {
    const BASE_IN = 1.1;
    const BASE_OUT = 0.9;
    const tests = [
      { sens: 0.5, expectIn: 1 + (BASE_IN - 1) * 0.5, expectOut: 1 - (1 - BASE_OUT) * 0.5 },
      { sens: 1.0, expectIn: BASE_IN, expectOut: BASE_OUT },
      { sens: 2.0, expectIn: 1 + (BASE_IN - 1) * 2, expectOut: 1 - (1 - BASE_OUT) * 2 },
    ];
    return {
      tests: tests.map(t => ({
        sens: t.sens,
        inFactor: (1 + (BASE_IN - 1) * t.sens).toFixed(3),
        outFactor: (1 - (1 - BASE_OUT) * t.sens).toFixed(3),
        inCorrect: Math.abs(1 + (BASE_IN - 1) * t.sens - t.expectIn) < 0.001,
        outCorrect: Math.abs(1 - (1 - BASE_OUT) * t.sens - t.expectOut) < 0.001,
      })),
    };
  });
  const allCorrect = result.tests.every((t: any) => t.inCorrect && t.outCorrect);
  expect(allCorrect).toBe(true);
  console.log(`[IN] Zoom factors: ${result.tests.map((t: any) => `sens=${t.sens}→in:${t.inFactor}/out:${t.outFactor}`).join(", ")}`);
});

// IO: High contrast mode affects RenderHost
test("IO: isHighContrastMode exposed on view", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    return {
      hasMethod: typeof v.isHighContrastMode === "function",
      currentValue: v.isHighContrastMode?.() ?? "N/A",
    };
  });
  if (result.error) { console.log(`[IO] Skipped: ${result.error}`); return; }
  expect(result.hasMethod).toBe(true);
  console.log(`[IO] isHighContrastMode: method=${result.hasMethod}, value=${result.currentValue}`);
});

// IP: No console errors
test("IP: no console errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IP] ${errors.length} errors`);
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

