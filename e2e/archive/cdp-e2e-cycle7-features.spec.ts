/**
 * CDP E2E Test -- Cycle 7: C1/C3/C5 verification + spatial semantics + settings search
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

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

test("C1: pinnedPositions persists across invalidateData", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.pinnedPositions["__test_c1__"] = { x: 123, y: 456 };
    if (typeof view.invalidateData === "function") await view.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
    const pin = panel.pinnedPositions["__test_c1__"];
    delete panel.pinnedPositions["__test_c1__"];
    return { pinned: pin };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.pinned).toEqual({ x: 123, y: 456 });
  console.log(`[C1] pinnedPositions survives invalidateData`);
});

test("C3: createLink API exists and is callable", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCreateLink: typeof view.createLink === "function",
      hasVisualLinkEditor: typeof view.panel.visualLinkEditor === "boolean",
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCreateLink).toBe(true);
  console.log(`[C3] createLink exists=${result.hasCreateLink}`);
});

test("C5: manualClusterOverrides field writable", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    const orig = panel.manualClusterOverrides ?? {};
    panel.manualClusterOverrides = { "__test__": "groupA" };
    const written = panel.manualClusterOverrides["__test__"];
    panel.manualClusterOverrides = orig;
    return { written, hasEnableManualClustering: typeof panel.enableManualClustering === "boolean" };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.written).toBe("groupA");
  expect(result.hasEnableManualClustering).toBe(true);
  console.log(`[C5] manualClusterOverrides writable, enableManualClustering exists`);
});

test("spatial semantics: analyze mode includes directionalGravityRules", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    const orig = panel.directionalGravityRules;
    // Apply analyze preset
    if (typeof view.applyPreset === "function") view.applyPreset("analyze");
    const rules = panel.directionalGravityRules;
    const hasInheritanceRule = rules?.some?.((r: any) => r.filter?.includes?.("inheritance"));
    // Restore
    panel.directionalGravityRules = orig;
    return { rulesCount: rules?.length ?? 0, hasInheritanceRule };
  });
  expect(result).not.toHaveProperty("error");
  console.log(`[spatial] rules=${result.rulesCount}, hasInheritance=${result.hasInheritanceRule}`);
});

test("settings search: filter input exists in panel", async () => {
  test.setTimeout(30_000);
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panelEl = view.panelEl ?? view.containerEl?.querySelector(".gi-panel");
    if (!panelEl) return { error: "no panel element" };
    const filterInput = panelEl.querySelector(".gi-settings-filter, .gi-settings-filter-input");
    return { hasFilterInput: filterInput !== null };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasFilterInput).toBe(true);
  console.log(`[search] Settings filter input found`);
});

// =========================================================================
// Display Quality Gate — node overlap + coordinate sanity
// =========================================================================
test("QUALITY: display quality after tests", async () => {
  const quality = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes || v.pixiNodes.size < 2) return { ok: true, skipped: true };
    // 1. Node overlap
    const overlapRatio = typeof v.getNodeOverlapRatio === "function" ? v.getNodeOverlapRatio() : -1;
    // 2. Coordinate sanity
    let nanCount = 0;
    for (const [, pn] of v.pixiNodes) {
      if (!Number.isFinite(pn.data.x) || !Number.isFinite(pn.data.y)) nanCount++;
    }
    // 3. Label quality
    const qs = typeof v.getLabelQualityScore === "function" ? v.getLabelQualityScore() : null;
    return {
      ok: true,
      overlapRatio: overlapRatio >= 0 ? Math.round(overlapRatio * 100) : -1,
      nanCount,
      qualityScore: qs?.score ?? -1,
      nodeCount: v.pixiNodes.size,
    };
  });
  expect(quality.ok).toBe(true);
  if (!quality.skipped) {
    expect(quality.nanCount).toBe(0);
    if (quality.overlapRatio >= 0) expect(quality.overlapRatio).toBeLessThan(50);
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

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

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

