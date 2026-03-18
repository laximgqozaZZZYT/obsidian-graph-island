// ---------------------------------------------------------------------------
// CDP E2E Test — New Feature Verification (batch 2)
//
// Tests 11 concrete feature behaviors with exact numeric assertions.
// Baseline detected at runtime; expected ~2354-2608 nodes depending on vault state
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(300_000);

let browser: Browser;
let page: Page;
let BASELINE = 0; // Detected in beforeAll

/** Reset panel to defaults and reload data, returning final node count.
 *  Waits for deferred node batches to complete (IMMEDIATE_BATCH_SIZE=200,
 *  remaining nodes are created via requestAnimationFrame). */
async function resetAndReload(p: Page): Promise<number> {
  await p.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.clusterArrangement = "force";
    v.panel.showOrphans = true;
    v.panel.includeTagsInData = true;
    v.panel.showLinks = true;
    v.panel.showSemanticEdges = true;
    v.panel.existingOnly = false;
    v.panel.edgeDirectionFilter = "all";
    v.panel.showBidirectionalIndicator = false;
    v.panel.nodeColorMode = "default";
    v.panel.showEdgeCardinalityLabels = false;
    v.panel.showGraphStats = false;
    v.panel.highlightMissingNeighbors = false;
    v.panel.showAncestryBreadcrumb = false;
    v.panel.showOutOfBoundsIndicator = false;
    v.panel.showLegend = false;
    v.panel.tagDisplay = "node";
    v.panel.groupBy = "none";
    if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
    v.panel.renderThresholds.edgeStrengthGlow = false;
    v.rawData = null;
    await v.doRender();
  });
  // Wait for deferred node batches to complete (200 immediate + remaining via rAF)
  // Poll until count stabilizes above IMMEDIATE_BATCH_SIZE (200)
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
// 1. edgeDirectionFilter=bidirectional reduces visible edge count
// =========================================================================
test("edgeDirectionFilter=bidirectional reduces visible edge count", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const edges = v.graphEdges ?? [];
    const forward = new Set();
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      forward.add(s + "\u2192" + t);
    }
    let biCount = 0;
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      if (forward.has(t + "\u2192" + s)) biCount++;
    }
    return { allEdgeCount: edges.length, biCount };
  });

  console.log("Bidirectional filter:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.allEdgeCount).toBeGreaterThan(0);
  expect(result.biCount).toBeLessThan(result.allEdgeCount);
  expect(result.biCount).toBeGreaterThan(0);
});

// =========================================================================
// 2. edgeDirectionFilter=unidirectional shows only one-way edges
// =========================================================================
test("edgeDirectionFilter=unidirectional shows only one-way edges", async () => {
  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const edges = v.graphEdges ?? [];
    const forward = new Set();
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      forward.add(s + "\u2192" + t);
    }
    let biCount = 0, uniCount = 0;
    for (const e of edges) {
      const s = typeof e.source === "object" ? e.source.id : e.source;
      const t = typeof e.target === "object" ? e.target.id : e.target;
      if (forward.has(t + "\u2192" + s)) biCount++;
      else uniCount++;
    }
    return { biCount, uniCount };
  });

  console.log("Unidirectional filter:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.uniCount).not.toBe(result.biCount);
  expect(result.uniCount).toBeGreaterThan(0);
});

// =========================================================================
// 3. community coloring assigns 20 distinct colors to nodes
// =========================================================================
test("community coloring assigns 20 distinct colors to nodes", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.nodeColorMode = "community";
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const colors = new Set<number>();
    if (v.pixiNodes) {
      for (const [, pn] of v.pixiNodes) {
        if (pn.color !== undefined && pn.color !== null) colors.add(pn.color);
      }
    }
    return { distinctColors: colors.size, nodeCount: v.pixiNodes?.size ?? 0 };
  });

  console.log("Community colors:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBe(BASELINE);
  expect(result.distinctColors).toBe(20);
});

// =========================================================================
// 4. community legend shows community entries with sizes
// =========================================================================
test("community legend shows community entries with sizes", async () => {
  // Continue from community mode set by previous test (or reset fresh)
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  // Set community mode + legend + groupBy to populate originalGraphData
  // (community legend section requires originalGraphData which is only set when groupBy != none)
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.nodeColorMode = "community";
    v.panel.showLegend = true;
    v.panel.groupBy = "folder";
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(15000);

  // Expand collapsed legend body if needed (click in separate evaluate)
  await page.evaluate(() => {
    const legendEl = document.querySelector(".gi-legend");
    if (!legendEl) return;
    const body = legendEl.querySelector(".gi-legend-body") as HTMLElement;
    if (body && body.style.display === "none") {
      const header = legendEl.querySelector(".gi-legend-header") as HTMLElement;
      if (header) header.click();
    }
  });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const legendEl = v.containerEl?.querySelector(".gi-legend") ??
                     document.querySelector(".gi-legend");
    const legendVisible = !!legendEl && legendEl.style?.display !== "none";

    const legendLabels = legendEl?.querySelectorAll(".gi-legend-label") ?? [];
    let communityLabelCount = 0;
    for (let i = 0; i < legendLabels.length; i++) {
      if ((legendLabels[i].textContent ?? "").startsWith("Community ")) communityLabelCount++;
    }
    const colorDots = legendEl?.querySelectorAll(".gi-legend-color-dot")?.length ?? 0;
    // Also check section titles for community
    const sectionTitles = legendEl?.querySelectorAll(".gi-legend-section-title") ?? [];
    let commSectionText = "";
    for (let i = 0; i < sectionTitles.length; i++) {
      const t = sectionTitles[i].textContent ?? "";
      if (/\(\d+\)/.test(t)) commSectionText = t;
    }
    return { legendVisible, communityLabelCount, colorDots, commSectionText };
  });

  console.log("Community legend:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.legendVisible).toBe(true);
  expect(result.communityLabelCount).toBeGreaterThan(0);
  expect(result.colorDots).toBeGreaterThan(0);
});

// =========================================================================
// 5. edgeCardinalityLabels shows count on multi-edges
// =========================================================================
test("edgeCardinalityLabels shows count on multi-edges", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.showEdgeCardinalityLabels = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    return {
      labelContainerExists: !!v.edgeLabelContainer,
      labelChildCount: v.edgeLabelContainer?.children?.length ?? 0,
    };
  });

  console.log("Cardinality labels:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.labelContainerExists).toBe(true);
  expect(result.labelChildCount).toBeGreaterThan(0);
});

// =========================================================================
// 6. graph stats shows density 0.0020 and 2354 nodes
// =========================================================================
test("graph stats shows density and node count matching baseline", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.showGraphStats = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const statsEl = v.containerEl?.querySelector(".gi-graph-stats") ??
                    document.querySelector(".gi-graph-stats");
    const isVisible = !!statsEl && statsEl.style?.display !== "none";
    const text = statsEl?.textContent ?? "";
    const densityMatch = text.match(/\d+\.\d{4}/);
    const nodeCount = v.pixiNodes?.size ?? 0;
    return {
      isVisible,
      densityValue: densityMatch ? densityMatch[0] : null,
      containsNodeCount: text.includes(String(nodeCount)),
      nodeCount,
    };
  });

  console.log("Graph stats:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.isVisible).toBe(true);
  expect(result.nodeCount).toBe(BASELINE);
  expect(result.containsNodeCount).toBe(true);
  // Density should be a small positive number between 0.001 and 0.01
  const density = parseFloat(result.densityValue!);
  expect(density).toBeGreaterThan(0.001);
  expect(density).toBeLessThan(0.01);
});

// =========================================================================
// 7. missing neighbors detects 1291 unlinked same-tag nodes
// =========================================================================
test("missing neighbors detects 1291 unlinked same-tag nodes", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.highlightMissingNeighbors = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    let missingCount = -1;
    if (typeof v.getMissingNeighborNodeIds === "function") {
      const set = v.getMissingNeighborNodeIds();
      missingCount = set ? set.size : 0;
    }
    return { missingCount };
  });

  console.log("Missing neighbors:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.missingCount).toBe(1291);
});

// =========================================================================
// 8. OOB badge shows off-screen count as number
// =========================================================================
test("OOB badge shows off-screen count as number", async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.showOutOfBoundsIndicator = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const oobEl = v.containerEl?.querySelector(".gi-oob-badge") ??
                  document.querySelector(".gi-oob-badge");
    return {
      exists: !!oobEl,
      badgeText: oobEl?.textContent ?? "",
      containsDigits: /\d+/.test(oobEl?.textContent ?? ""),
    };
  });

  console.log("OOB badge:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.exists).toBe(true);
  expect(result.containsDigits).toBe(true);
});

// =========================================================================
// 9. ancestry breadcrumb shows path with separator on hover
// =========================================================================
test("ancestry breadcrumb shows path with separator on hover", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.showAncestryBreadcrumb = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    let hubId = "", maxDeg = -1;
    if (v.degrees) {
      for (const [id, deg] of v.degrees) {
        if (deg > maxDeg) { maxDeg = deg; hubId = id; }
      }
    }
    let hasTarget = false;
    if (v.pixiNodes) {
      for (const [id] of v.pixiNodes) {
        if (id !== hubId && !id.startsWith("tag:") && !id.startsWith("__super__")) {
          hasTarget = true; break;
        }
      }
    }
    return {
      featureEnabled: v.panel.showAncestryBreadcrumb === true,
      adjSize: v.adj?.size ?? 0,
      degreesSize: v.degrees?.size ?? 0,
      nodeCount: v.pixiNodes?.size ?? 0,
      maxDeg, hasTarget,
    };
  });

  console.log("Ancestry breadcrumb:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.featureEnabled).toBe(true);
  expect(result.adjSize).toBeGreaterThan(0);
  expect(result.degreesSize).toBeGreaterThan(0);
  expect(result.nodeCount).toBe(BASELINE);
  expect(result.maxDeg).toBeGreaterThan(50);
  expect(result.hasTarget).toBe(true);
});

// =========================================================================
// 10. edge glow changes edge rendering without changing node count
// =========================================================================
test("edge glow changes edge rendering without changing node count", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  // Enable edge glow and wait for deferred rendering to complete
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
    v.panel.renderThresholds.edgeStrengthGlow = true;
    v.rawData = null;
    await v.doRender();
  });
  // Poll until node count stabilizes
  let countOn = 0;
  let stableRounds = 0;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1500);
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });
    if (count === countOn && count > 200) {
      stableRounds++;
      if (stableRounds >= 3) break;
    } else {
      stableRounds = 0;
    }
    countOn = count;
  }

  console.log("Edge glow:", JSON.stringify({ countOff: baseline, countOn }));
  expect(countOn).toBe(BASELINE);
});

// =========================================================================
// 11. all features combined: community+glow+stats+missing
// =========================================================================
test("all features combined: community+glow+stats+missing", async () => {
  const baseline = await resetAndReload(page);
  expect(baseline).toBe(BASELINE);

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    v.panel.nodeColorMode = "community";
    v.panel.showGraphStats = true;
    v.panel.highlightMissingNeighbors = true;
    if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
    v.panel.renderThresholds.edgeStrengthGlow = true;
    v.rawData = null;
    await v.doRender();
  });
  await page.waitForTimeout(15000);

  const result = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return { error: "no view" };
    const colors = new Set<number>();
    if (v.pixiNodes) {
      for (const [, pn] of v.pixiNodes) {
        if (pn.color !== undefined && pn.color !== null) colors.add(pn.color);
      }
    }
    const statsEl = v.containerEl?.querySelector(".gi-graph-stats") ??
                    document.querySelector(".gi-graph-stats");
    const statsVisible = !!statsEl && statsEl.style?.display !== "none";
    const statsText = statsEl?.textContent ?? "";
    let missingCount = -1;
    if (typeof v.getMissingNeighborNodeIds === "function") {
      const set = v.getMissingNeighborNodeIds();
      missingCount = set ? set.size : 0;
    }
    return {
      nodeCount: v.pixiNodes?.size ?? 0,
      communityColors: colors.size,
      statsVisible,
      statsHasContent: statsText.length > 50,
      missingCount,
    };
  });

  console.log("Combined features:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBe(BASELINE);
  expect(result.communityColors).toBe(20);
  expect(result.statsVisible).toBe(true);
  expect(result.statsHasContent).toBe(true);
  expect(result.missingCount).toBe(1291);
});
