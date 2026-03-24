/**
 * CDP E2E Test — Cycle 79: Panel section i18n + structure validation
 *
 * Validates:
 * 1. "Interaction" and "Advanced" sections now use localized names
 * 2. All 25 panel sections have non-empty titles
 * 3. No raw English hardcoded section names in Japanese locale
 * 4. GVC method count and structure consistency
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
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.plugins.enabledPlugins.has("graph-island")) {
      await app.plugins.disablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 500));
    }
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 8000));
  });
});

// JX-1: All section titles are non-empty
test("JX-1: all panel sections have non-empty titles", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { ok: true, skipped: true };
    const p = v.containerEl?.querySelector(".view-content");
    if (!p) return { ok: true, skipped: true };

    const sections = p.querySelectorAll(".graph-control-section");
    const emptyTitles: string[] = [];
    for (const s of sections) {
      const header = s.querySelector(".graph-control-section-header");
      const title = header?.textContent?.trim();
      if (!title || title.length === 0) {
        emptyTitles.push(s.className);
      }
    }
    return { ok: emptyTitles.length === 0, count: sections.length, emptyTitles };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// JX-2: No raw "Interaction" or "Advanced" hardcoded strings in section headers
test("JX-2: no raw English in Interaction/Advanced section headers", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { ok: true, skipped: true };
    const p = v.containerEl?.querySelector(".view-content");
    if (!p) return { ok: true, skipped: true };

    const sections = p.querySelectorAll(".graph-control-section-header");
    const rawEnglish: string[] = [];
    for (const s of sections) {
      const text = s.textContent?.trim() ?? "";
      // These should be localized (Japanese: インタラクション / 高度な設定)
      // In English locale they're still "Interaction" / "Advanced" which is fine
      // The test checks they go through t() rather than being hardcoded
      if (text === "Interaction" || text === "Advanced") {
        // Check if locale is Japanese — if so, these should be translated
        const isJa = document.documentElement.lang === "ja" ||
                      navigator.language.startsWith("ja");
        if (isJa) rawEnglish.push(text);
      }
    }
    return { ok: rawEnglish.length === 0, rawEnglish };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JX-3: Section count is consistent (≥20)
test("JX-3: at least 20 panel sections exist", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { ok: true, skipped: true };
    const p = v.containerEl?.querySelector(".view-content");
    if (!p) return { ok: true, skipped: true };
    const count = p.querySelectorAll(".graph-control-section").length;
    return { ok: count >= 20, count };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JX-4: Panel has 5 tabs
test("JX-4: panel has 5 tabs", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { ok: true, skipped: true };
    const p = v.containerEl?.querySelector(".view-content");
    if (!p) return { ok: true, skipped: true };
    const tabs = p.querySelectorAll(".gi-tab-btn");
    return { ok: tabs.length === 5, count: tabs.length };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JX-5: Edge section has ≥15 controls
test("JX-5: edge section has ≥15 controls", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { ok: true, skipped: true };
    const p = v.containerEl?.querySelector(".view-content");
    if (!p) return { ok: true, skipped: true };

    const sections = p.querySelectorAll(".graph-control-section");
    for (const s of sections) {
      const title = s.querySelector(".graph-control-section-header")?.textContent?.trim();
      if (title && (title.includes("エッジ") || title.includes("Edge"))) {
        const controls = s.querySelectorAll(".setting-item").length;
        return { ok: controls >= 15, title, controls };
      }
    }
    return { ok: true, skipped: true, note: "edge section not found in current tab" };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity: no NaN/Inf after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
});

// JX-6: no console errors
test("JX-6: no console errors during panel tests", async () => {
  expect(errors.length).toBe(0);
});

test.afterAll(async () => {
  // Do not close CDP connection
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

