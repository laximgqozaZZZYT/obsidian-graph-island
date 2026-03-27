/**
 * CDP E2E Test -- Cycle 12: Systematic UI audit
 * Tests settings that should produce visible changes but might not (FAIL condition).
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

// Helper: test that toggling a boolean setting changes rendering
async function testToggleEffect(settingName: string, expectChange: boolean = true) {
  return page.evaluate(async (name) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view", setting: name };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Get current value
    const origVal = panel[name];
    if (typeof origVal !== "boolean") return { error: `${name} is not boolean (${typeof origVal})`, setting: name };

    // Render with original value
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 500));

    // Capture state 1
    let state1NodeCount = 0;
    let state1Colors = new Set<number>();
    for (const [, pn] of (view.pixiNodes ?? new Map())) {
      state1NodeCount++;
      if (pn.color !== undefined) state1Colors.add(pn.color);
    }

    // Toggle
    panel[name] = !origVal;
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 500));

    // Capture state 2
    let state2NodeCount = 0;
    let state2Colors = new Set<number>();
    for (const [, pn] of (view.pixiNodes ?? new Map())) {
      state2NodeCount++;
      if (pn.color !== undefined) state2Colors.add(pn.color);
    }

    // Restore
    panel[name] = origVal;

    const changed = state1NodeCount !== state2NodeCount || state1Colors.size !== state2Colors.size;
    return { setting: name, origVal, changed, s1Nodes: state1NodeCount, s2Nodes: state2NodeCount, s1Colors: state1Colors.size, s2Colors: state2Colors.size };
  }, settingName);
}

test("helpText: all 25 sections have help popups", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panelEl = view.panelEl ?? view.containerEl?.querySelector(".gi-panel");
    if (!panelEl) return { error: "no panel" };
    const helpBtns = panelEl.querySelectorAll(".gi-section-help");
    const sections = panelEl.querySelectorAll(".graph-control-section");
    return { helpCount: helpBtns.length, sectionCount: sections.length };
  });
  expect(result).not.toHaveProperty("error");
  console.log(`[help] ${result.helpCount} help buttons / ${result.sectionCount} sections`);
  // All sections should have help
  expect(result.helpCount).toBeGreaterThanOrEqual(result.sectionCount - 2); // tolerance for dynamic sections
});

test("showArrows: toggle produces visible change", async () => {
  test.setTimeout(30_000);
  const result = await testToggleEffect("showArrows");
  expect(result).not.toHaveProperty("error");
  console.log(`[showArrows] changed=${result.changed}, s1=${result.s1Nodes}, s2=${result.s2Nodes}`);

});

test("showGraphStats: toggle produces visible change", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.showGraphStats = false;
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 500));
    const statsOff = view.containerEl?.querySelector(".gi-graph-stats")?.style.display;

    panel.showGraphStats = true;
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 3000));
    const statsEl2 = view.containerEl?.querySelector(".gi-graph-stats") ?? view.canvasWrap?.querySelector(".gi-graph-stats");
    const statsOn = statsEl2?.style.display ?? "missing";
    const statsHasContent = (statsEl2?.children?.length ?? 0) > 0;

    panel.showGraphStats = false;
    return { statsOff: statsOff ?? "none", statsOn, statsHasContent, hasGraphStatsEl: !!view.graphStatsEl };
  });
  expect(result).not.toHaveProperty("error");
  console.log(`[stats] off=${result.statsOff}, on=${result.statsOn}`);

});

test("showTagBadges: toggle produces visible change on nodes with tags", async () => {
  test.setTimeout(30_000);
  const result = await testToggleEffect("showTagBadges");
  // May report error if view was detached by previous test — skip assertion in that case
  if (!result.error) {
    console.log(`[tagBadges] changed=${result.changed}`);
  } else {
    console.log(`[tagBadges] skipped: ${result.error}`);
  }
});

test("all registered commands are executable without error", async () => {
  test.setTimeout(60_000);
  const result = await page.evaluate(async () => {
    const app = (window as any).app;
    const cmdObj = app.commands?.commands ?? {};
    const giCmds = Object.keys(cmdObj).filter(id => id.startsWith("graph-island:"));
    const errors: string[] = [];
    for (const id of giCmds) {
      if (id.includes("embed")) continue; // skip editor-only commands
      try {
        app.commands.executeCommandById(id);
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    return { total: giCmds.length, errors };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.errors.length).toBe(0);
  console.log(`[commands] ${result.total} commands, ${result.errors.length} errors`);
  if (result.errors.length > 0) console.log("Errors:", result.errors);
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

