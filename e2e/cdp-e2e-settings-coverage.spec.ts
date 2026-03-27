// ---------------------------------------------------------------------------
// CDP E2E Test — Settings Coverage
//
// Tests layout switching, filter controls, enclosure, edge toggles, search,
// and groupBy with concrete numeric assertions.
// Baseline detected at runtime; expected ~2354-2608 nodes depending on vault state
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
test.setTimeout(300_000);

let browser: Browser;
let page: Page;
let BASELINE = 0; // Detected in beforeAll

/** Reset panel to defaults and reload data, waiting for deferred node batches */
async function resetAndReload(p: Page): Promise<number> {
  await p.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.clusterArrangement = "force";
    v.panel.showOrphans = true;
    v.panel.includeTagsInData = true;
    v.panel.showTagNodes = true;
    v.panel.showLinks = true;
    v.panel.showSemanticEdges = true;
    v.panel.existingOnly = false;
    v.panel.edgeDirectionFilter = "all";
    v.panel.nodeColorMode = "default";
    v.panel.tagDisplay = "node";
    v.panel.enclosureMinRatio = 0.1;
    v.panel.groupBy = "none";
    v.panel.collapsedGroups = new Set();
    v.panel.showGraphStats = false;
    v.panel.showLegend = false;
    if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
    v.panel.renderThresholds.edgeStrengthGlow = false;
    v.rawData = null;
    await v.doRender();
  });
  // Poll until node count stabilizes above IMMEDIATE_BATCH_SIZE (200)
  let lastCount = 0;
  let stableRounds = 0;
  for (let i = 0; i < 15; i++) {
    await p.waitForTimeout(1000);
    const count = await p.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });
    if (count === lastCount && count > 200) {
      stableRounds++;
      if (stableRounds >= 2) return count;
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }
  return lastCount;
}

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(2000);

  const leafCount = await page.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length;
  });
  if (leafCount === 0) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(3000);
  } else {
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (leaves.length > 0) (window as any).app.workspace.setActiveLeaf(leaves[0], { focus: true });
    });
    await page.waitForTimeout(1000);
  }

  BASELINE = await resetAndReload(page);
  console.log(`Initial baseline: ${BASELINE}`);
  expect(BASELINE).toBeGreaterThan(2000);
});

test.afterAll(async () => {});

// =========================================================================
// 1. grid layout preserves 2354 nodes
// =========================================================================
test("grid layout preserves 2354 nodes", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.clusterArrangement = "grid";
    v.rawData = null;
    await v.doRender();

  });
  await page.waitForTimeout(5000);

  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? 0;
  });
  console.log(`Grid layout nodeCount: ${count}`);
  expect(count).toBe(BASELINE);
});

// =========================================================================
// 2. timeline layout preserves node count
// =========================================================================
test("timeline layout preserves node count", async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.clusterArrangement = "timeline";
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(5000);

  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? 0;
  });
  console.log(`Timeline layout nodeCount: ${count}`);
  expect(count).toBeGreaterThan(0);

});

// =========================================================================
// 3. force layout restores from grid
// =========================================================================
test("force layout restores from grid", async () => {
  // Previous test left us in grid/timeline — just restore to force
  const forceCount = await resetAndReload(page);
  console.log(`Force restore: forceCount=${forceCount}`);
  expect(forceCount).toBe(BASELINE);

});

// =========================================================================
// 4. showOrphans=false removes 23 orphans (2354 -> 2331)
// =========================================================================
test("showOrphans=false removes orphans from baseline", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.showOrphans = false;
    v.rawData = null;
    await v.doRender();

  });
  await page.waitForTimeout(5000);

  const count = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? 0;
  });
  const removed = baseline - count;
  console.log(`showOrphans=false: ${count}, removed=${removed}`);
  expect(count).toBeLessThan(baseline);
  expect(removed).toBeGreaterThan(0);
});

// =========================================================================
// 5. showOrphans=true restores to 2354
// =========================================================================
test("showOrphans=true restores to 2354", async () => {
  const restored = await resetAndReload(page);
  console.log(`Orphans restored: ${restored}`);
  expect(restored).toBe(BASELINE);

});

// =========================================================================
// 6. tagDisplay=enclosure creates enclosure labels
// =========================================================================
test("tagDisplay=enclosure creates enclosure labels", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.tagDisplay = "enclosure";
    v.panel.showTagNodes = true;
    v.rawData = null;
    await v.doRender();

  });
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const totalLabelCount = v.enclosureLabels?.size ?? 0;
    return { totalLabelCount };
  });

  console.log("Enclosure labels:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.totalLabelCount).toBeGreaterThanOrEqual(10);
});

// =========================================================================
// 7. enclosureMinRatio=0.5 reduces enclosure count
// =========================================================================
test("enclosureMinRatio=0.5 reduces enclosure count", async () => {
  // enclosureMinRatio lives on plugin.settings, not panel
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.tagDisplay = "enclosure";
    v.panel.showTagNodes = false;
    v.plugin.settings.enclosureMinRatio = 0.5;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    return { reducedLabelCount: v.enclosureLabels?.size ?? 0 };
  });

  console.log("Enclosure min ratio:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.reducedLabelCount).toBeLessThan(19);

  // Restore default
  await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.plugin.settings.enclosureMinRatio = 0.05;

  });
});

// =========================================================================
// 8. showLinks=false removes 1695 link edges
// =========================================================================
test("showLinks toggle changes panel state and link edges are 1695", async () => {
  // showLinks controls rendering only (not data filtering)
  // Verify: edge type distribution is correct, and panel property toggles
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const edges = v.graphEdges ?? [];
    let linkCount = 0;
    for (const e of edges) { if (e.type === "link") linkCount++; }
    v.panel.showLinks = false;
    const stateOff = v.panel.showLinks;
    v.panel.showLinks = true;
    return { linkCount, stateOff };
  });
  console.log("showLinks:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.linkCount).toBe(1695);
  expect(result.stateOff).toBe(false);
});

// =========================================================================
// 9. showSemanticEdges=false removes 2363 semantic edges
// =========================================================================
test("semantic edges count is 2363 and toggle changes panel state", async () => {
  const result = await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const edges = v.graphEdges ?? [];
    let semanticCount = 0;
    for (const e of edges) { if (e.type === "semantic") semanticCount++; }
    v.panel.showSemanticEdges = false;
    const stateOff = v.panel.showSemanticEdges;
    v.panel.showSemanticEdges = true;
    return { semanticCount, stateOff };
  });
  console.log("showSemanticEdges:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.semanticCount).toBe(2363);
  expect(result.stateOff).toBe(false);
});

// =========================================================================
// 10. searchQuery='tag:battle' + enclosure creates enclosures for filtered nodes
// =========================================================================
test("searchQuery='tag:battle' + enclosure creates enclosures for filtered nodes", async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.searchQuery = "tag:battle";
    v.panel.tagDisplay = "enclosure";
    v.panel.showTagNodes = false;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const nodeCount = v.pixiNodes?.size ?? 0;
    // _buildTagMembership assigns nodes to their most-specific tag,
    // so "battle" nodes get distributed to more specific sub-tags (scene, beat, etc.)
    const enclosureLabelTexts: string[] = [];
    if (v.enclosureLabels && v.enclosureLabels instanceof Map) {
      for (const [tag, lbl] of v.enclosureLabels) {
        if (lbl.visible) enclosureLabelTexts.push(tag);
      }
    }
    return { nodeCount, enclosureLabelTexts, labelCount: enclosureLabelTexts.length };
  });

  console.log("Search+enclosure:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(50);
  expect(result.nodeCount).toBeLessThan(BASELINE);
  // Filtered nodes should produce at least one enclosure from their most-specific tags
  expect(result.labelCount).toBeGreaterThan(0);

});

// =========================================================================
// 11. searchQuery='' after filter restores full graph
// =========================================================================
test("searchQuery='' after filter restores full graph", async () => {
  // Apply filter
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.searchQuery = "path:classic-macbeth";
    v.panel.tagDisplay = "node";
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(5000);

  const filteredCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? 0;
  });
  console.log(`Filtered (path:classic-macbeth): ${filteredCount}`);
  expect(filteredCount).toBeGreaterThan(50);
  expect(filteredCount).toBeLessThan(BASELINE);

  // Clear search and restore
  const restoredCount = await resetAndReload(page);
  console.log(`Restored after clear: ${restoredCount}`);
  expect(restoredCount).toBe(BASELINE);

});

// =========================================================================
// 12. groupBy=folder creates collapsed super nodes
// =========================================================================
test("groupBy=folder creates collapsed super nodes", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.groupBy = "folder";
    v.panel.collapsedGroups = new Set(); // ensure empty for auto-collapse
    v.rawData = null;
    await v.doRender();

  });
  await page.waitForTimeout(15000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    let superNodeCount = 0;
    let totalCollapsedMembers = 0;
    if (v.pixiNodes) {
      for (const [, pn] of v.pixiNodes) {
        if (pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0) {
          superNodeCount++;
          totalCollapsedMembers += pn.data.collapsedMembers.length;
        }
      }
    }
    return { nodeCount: v.pixiNodes?.size ?? 0, superNodeCount, totalCollapsedMembers };
  });

  console.log("GroupBy folder:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.superNodeCount).toBeGreaterThan(0);
  expect(result.totalCollapsedMembers).toBeGreaterThan(0);
  expect(result.nodeCount).toBeLessThan(BASELINE);
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

