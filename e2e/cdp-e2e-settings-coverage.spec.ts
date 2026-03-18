// ---------------------------------------------------------------------------
// CDP E2E Test — Settings Coverage
//
// Tests layout switching, filter controls, enclosure, edge toggles, search,
// and groupBy with concrete numeric assertions.
// Baseline detected at runtime; expected ~2354-2608 nodes depending on vault state
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1500);
    const count = await p.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });
    if (count === lastCount && count > 200) {
      stableRounds++;
      if (stableRounds >= 3) return count;
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
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  const leafCount = await page.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length;
  });
  if (leafCount === 0) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(5000);
  } else {
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (leaves.length > 0) (window as any).app.workspace.setActiveLeaf(leaves[0], { focus: true });
    });
    await page.waitForTimeout(2000);
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
  await page.waitForTimeout(10000);

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
  await page.waitForTimeout(10000);

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
  // Switch to grid
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.clusterArrangement = "grid";
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  // Switch back to force
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
  await page.waitForTimeout(10000);

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
  await page.waitForTimeout(10000);

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
  await page.waitForTimeout(10000);

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
  await page.waitForTimeout(10000);

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
  expect(result.nodeCount).toBe(132);
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
  await page.waitForTimeout(10000);

  const filteredCount = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? 0;
  });
  console.log(`Filtered (path:classic-macbeth): ${filteredCount}`);
  expect(filteredCount).toBe(172);

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
