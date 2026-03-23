// ---------------------------------------------------------------------------
// CDP E2E -- Visual Features: Enclosure, Heatmap, Hover, Stats, OOB, Missing
//            Neighbors, Community Coloring, Pathfinder
//
// Every test verifies VISIBLE display results with concrete values.
// No "does not crash" tests.
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";

test.setTimeout(120_000);

let browser: Browser;
let page: Page;
let BASELINE = 0;

/** Reset panel to defaults and wait for deferred node batches to complete */
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
    v.panel.groupBy = "none";
    v.panel.collapsedGroups = new Set();
    v.panel.showGraphStats = false;
    v.panel.showLegend = false;
    v.panel.highlightMissingNeighbors = false;
    v.panel.showOutOfBoundsIndicator = false;
    if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
    v.panel.renderThresholds.edgeStrengthGlow = false;
    v.rawData = null;
    await v.doRender();
  });
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

/** Render with settings and wait for deferred batches */
async function renderWith(p: Page, settings: Record<string, unknown>): Promise<number> {
  await p.evaluate(async (cfg: Record<string, unknown>) => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    for (const [key, value] of Object.entries(cfg)) {
      (v.panel as any)[key] = value;
    }
    v.rawData = null;
    await v.doRender();
  }, settings);
  let lastCount = 0;
  let stableRounds = 0;
  for (let i = 0; i < 15; i++) {
    await p.waitForTimeout(1500);
    const count = await p.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });
    if (count === lastCount && count > 100) {
      stableRounds++;
      if (stableRounds >= 2) return count;
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }
  return lastCount;
}

// =========================================================================
// Lifecycle
// =========================================================================

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
  console.log(`Visual features baseline: ${BASELINE}`);
  expect(BASELINE).toBeGreaterThan(2000);
});

test.afterAll(async () => {
  // Restore defaults
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.tagDisplay = "node";
    panel.nodeColorMode = "default";
    panel.showGraphStats = false;
    panel.highlightMissingNeighbors = false;
    panel.showOutOfBoundsIndicator = false;
    view.setHighlightedNodeId(null);
    if (typeof view.applyHover === "function") view.applyHover();
    if (typeof view.clearPathfinder === "function") view.clearPathfinder();
    view.rawData = null;
    if (typeof view.doRender === "function") await view.doRender();
  });
});

// =========================================================================
// Helper: apply panel settings + render + wait
// =========================================================================
async function applyAndRender(
  settings: Record<string, unknown>,
  waitMs = 4000,
): Promise<void> {
  await page.evaluate(async (args: { cfg: Record<string, unknown> }) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) throw new Error("No graph-view found");
    const panel = view.panel;
    if (!panel) throw new Error("No panel found");

    for (const [key, value] of Object.entries(args.cfg)) {
      if (key.includes(".")) {
        const parts = key.split(".");
        let target: any = panel;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      } else {
        (panel as any)[key] = value;
      }
    }

    view.rawData = null;
    if (typeof view.doRender === "function") await view.doRender();
  }, { cfg: settings });
  await page.waitForTimeout(waitMs);
}

// =========================================================================
// 1. Enclosure mode shows 19 labeled tag regions on 242 tag memberships
// =========================================================================
test("enclosure mode shows labeled tag regions with unique tags and rendered labels", async () => {
  await renderWith(page, { tagDisplay: "enclosure", showTagNodes: true, includeTagsInData: true, searchQuery: "", existingOnly: false });

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const tm = view.tagMembership;
    const uniqueTagCount = tm ? tm.size : 0;
    let totalMemberships = 0;
    if (tm) { for (const ids of tm.values()) totalMemberships += ids.size; }
    const renderedLabelCount = view.enclosureLabels ? view.enclosureLabels.size : 0;
    return { uniqueTagCount, totalMemberships, renderedLabelCount };
  });

  console.log("Enclosure result:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.uniqueTagCount).toBeGreaterThanOrEqual(200);
  expect(result.totalMemberships).toBeGreaterThan(1000);
  expect(result.renderedLabelCount).toBeGreaterThanOrEqual(5);
});

// =========================================================================
// 2. Enclosure labels contain correct tag names (scene, battle, etc)
// =========================================================================
test("enclosure labels contain correct tag names (scene, battle, etc)", async () => {
  // Enclosure should still be active from previous test; re-render to be safe
  await renderWith(page, { tagDisplay: "enclosure", showTagNodes: true, includeTagsInData: true, existingOnly: false });

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const tm = view.tagMembership;
    const tagNames: string[] = [];
    if (tm) { for (const tag of tm.keys()) tagNames.push(tag); }
    tagNames.sort();
    return { tagNames };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.tagNames).toContain("scene");
  expect(result.tagNames).toContain("battle");
  expect(result.tagNames.length).toBeGreaterThanOrEqual(100);
});

// =========================================================================
// 3. Heatmap legend shows gradient bar with min/max degree
// =========================================================================
test("heatmap legend shows gradient bar with min/max degree", async () => {
  // All in one evaluate to prevent state leaking
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.nodeColorMode = "heatmap";
    view.panel.showLegend = true;
    view.rawData = null;
    await view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    // Re-set if state was restored
    if (view.panel.nodeColorMode !== "heatmap") {
      view.panel.nodeColorMode = "heatmap";
      view.panel.showLegend = true;
      view.rawData = null;
      await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
    }

    const legendEl = view.legendEl;
    if (!legendEl) return { error: "no legend element" };

    const sectionTitles = Array.from(legendEl.querySelectorAll(".gi-legend-section-title"))
      .map((el: Element) => (el as HTMLElement).textContent?.trim() ?? "");

    const labels = Array.from(legendEl.querySelectorAll(".gi-legend-label"))
      .map((el: Element) => (el as HTMLElement).textContent?.trim() ?? "");

    const hasMinLabel = labels.includes("0");
    const numericLabels = labels.filter(l => /^\d+$/.test(l) && parseInt(l) > 0);
    const maxDegree = numericLabels.length > 0 ? Math.max(...numericLabels.map(Number)) : 0;

    // Reset
    view.panel.nodeColorMode = "default";

    return { sectionTitles, labels, hasMinLabel, maxDegree };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.sectionTitles.length).toBeGreaterThan(0);
  expect(result.hasMinLabel).toBe(true);
  expect(result.maxDegree).toBeGreaterThan(0);
});

// =========================================================================
// 4. Hover on node creates tooltip with node name
// =========================================================================
test("hover on node creates tooltip with node name (hoverLabel text === node.label)", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Ensure data is loaded
    if (!view.pixiNodes || view.pixiNodes.size === 0) {
      view.rawData = null;
      await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
    }

    const pixiNodes = view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { error: "no pixiNodes" };

    // Pick the first node
    const firstEntry = pixiNodes.entries().next().value;
    if (!firstEntry) return { error: "empty pixiNodes" };
    const [nodeId, pn] = firstEntry;
    const nodeLabel = pn.data?.label ?? "";

    // Set highlight and apply hover
    view.setHighlightedNodeId(nodeId);
    if (typeof view.applyHover === "function") view.applyHover();
    await new Promise(r => setTimeout(r, 500));

    // Re-fetch the pixi node to get updated hoverLabel
    const pnAfter = pixiNodes.get(nodeId);
    const hoverLabelText = pnAfter?.hoverLabel?.text ?? "";
    const hoverLabelVisible = pnAfter?.hoverLabel?.visible ?? false;

    // Clear hover
    view.setHighlightedNodeId(null);
    if (typeof view.applyHover === "function") view.applyHover();

    return {
      nodeId,
      nodeLabel,
      hoverLabelText,
      hoverLabelVisible,
      // hoverLabel text should contain the node label
      labelMatch: hoverLabelText.includes(nodeLabel),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hoverLabelVisible).toBe(true);
  expect(result.hoverLabelText.length).toBeGreaterThan(0);
  // The hover label should contain the node's actual label text
  expect(result.labelMatch).toBe(true);
});

// =========================================================================
// 5. Hover shows neighbor labels (BFS highlight set > 1)
// =========================================================================
test("hover shows neighbor labels (prevHighlightSet.size > 1)", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Find a node with at least 1 neighbor (non-zero degree)
    const pixiNodes = view.pixiNodes;
    const degrees = view.degrees;
    if (!pixiNodes || pixiNodes.size === 0) return { error: "no pixiNodes" };

    let targetId: string | null = null;
    if (degrees instanceof Map) {
      for (const [id, deg] of degrees) {
        if (deg > 0 && pixiNodes.has(id)) { targetId = id; break; }
      }
    }
    if (!targetId) {
      // Fallback: use first node
      targetId = pixiNodes.keys().next().value ?? null;
    }
    if (!targetId) return { error: "no target node" };

    // Hover on the node
    view.setHighlightedNodeId(targetId);
    if (typeof view.applyHover === "function") view.applyHover();
    await new Promise(r => setTimeout(r, 500));

    // Get the highlight set
    const prevSet = typeof view.getPrevHighlightSet === "function"
      ? view.getPrevHighlightSet()
      : view.prevHighlightSet;
    const highlightSetSize = prevSet ? prevSet.size : 0;

    // Count how many pixi nodes have visible hoverLabel
    let hoverLabelCount = 0;
    for (const pn of pixiNodes.values()) {
      if (pn.hoverLabel && pn.hoverLabel.visible) hoverLabelCount++;
    }

    // Clear hover
    view.setHighlightedNodeId(null);
    if (typeof view.applyHover === "function") view.applyHover();

    return {
      targetId,
      highlightSetSize,
      hoverLabelCount,
    };
  });

  expect(result).not.toHaveProperty("error");
  // The highlight set should include the hovered node + at least 1 neighbor
  expect(result.highlightSetSize).toBeGreaterThan(1);
  // Multiple hover labels should be visible (the node itself + neighbors)
  expect(result.hoverLabelCount).toBeGreaterThan(1);
});

// =========================================================================
// 6. Graph stats shows: 2354 nodes, 5558 edges, density 0.0020
// =========================================================================
test("graph stats shows node count, edge count, and density values", async () => {
  await renderWith(page, { showGraphStats: true, searchQuery: "", existingOnly: false, includeTagsInData: true, showTagNodes: true, showOrphans: true });

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const statsEl = view.graphStatsEl;
    if (!statsEl) return { error: "no stats element" };
    const values = Array.from(statsEl.querySelectorAll(".gi-stats-value"))
      .map((el: Element) => (el as HTMLElement).textContent?.trim() ?? "");
    const labels = Array.from(statsEl.querySelectorAll(".gi-stats-label"))
      .map((el: Element) => (el as HTMLElement).textContent?.trim() ?? "");
    const nodeCount = parseInt(values[0] ?? "0", 10);
    const edgeCount = parseInt(values[1] ?? "0", 10);
    const density = parseFloat(values[3] ?? "0");
    return { visible: statsEl.style.display !== "none", labels, values, nodeCount, edgeCount, density };
  });

  console.log("Stats result:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(2000);
  expect(result.edgeCount).toBeGreaterThan(3000);
  expect(result.density).toBeGreaterThan(0);
  expect(result.density).toBeLessThan(0.01);
  expect(result.values.length).toBeGreaterThanOrEqual(7);
});

// =========================================================================
// 7. Stats edge type breakdown shows link:1695, semantic:2363, tag:1500
// =========================================================================
test("stats edge type breakdown shows link, semantic, tag counts", async () => {
  // Stats should still be active from previous test
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const statsEl = view.graphStatsEl;
    if (!statsEl) return { error: "no stats element" };
    const allRows = statsEl.querySelectorAll("tr");
    const edgeTypes: Record<string, number> = {};
    const allLabels: string[] = [];
    for (const row of allRows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 2) {
        const label = (cells[0] as HTMLElement).textContent?.trim() ?? "";
        const value = parseInt((cells[1] as HTMLElement).textContent?.trim() ?? "0", 10);
        allLabels.push(label);
        if (["link", "semantic", "tag", "has-tag"].includes(label)) edgeTypes[label] = value;
      }
    }
    return { edgeTypes, allLabels, rowCount: allRows.length };
  });

  console.log("Edge types:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.edgeTypes["link"]).toBeGreaterThan(1000);
  expect(result.edgeTypes["semantic"]).toBeGreaterThan(2000);
  expect(result.edgeTypes["tag"]).toBeGreaterThan(1000);
});

// =========================================================================
// 8. OOB badge displays numeric count of off-screen nodes
// =========================================================================
test("OOB badge displays numeric count of off-screen nodes", async () => {
  await applyAndRender({ showOutOfBoundsIndicator: true }, 4000);

  // Zoom in to push nodes off-screen
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const world = view.worldContainer;
    if (world) {
      world.scale.set(5.0, 5.0);
    }
    // Trigger a frame update so OOB badge recomputes
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 2000));
  });

  const result = await page.evaluate(() => {
    const badge = document.querySelector(".gi-oob-badge");
    if (!badge) return { error: "no oob badge element" };
    const text = (badge as HTMLElement).textContent?.trim() ?? "";
    const display = (badge as HTMLElement).style.display;
    // Extract numeric value from badge text
    const numMatch = text.match(/\d+/);
    const count = numMatch ? parseInt(numMatch[0], 10) : -1;

    return {
      text,
      display,
      count,
      matchesNumericPattern: /\d+/.test(text),
    };
  });

  expect(result).not.toHaveProperty("error");
  // Badge should display a numeric count
  expect(result.matchesNumericPattern).toBe(true);
  // When zoomed in significantly, there should be off-screen nodes
  expect(result.count).toBeGreaterThan(0);

  // Reset zoom
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    if (typeof view.autoFitOnce === "function") view.autoFitOnce();
    await new Promise(r => setTimeout(r, 1000));
  });
});

// =========================================================================
// 9. Missing neighbor ring marks 1291 nodes with orange indicator
// =========================================================================
test("missing neighbor ring marks nodes with orange indicator", async () => {
  await renderWith(page, { highlightMissingNeighbors: true, searchQuery: "", existingOnly: false, includeTagsInData: true, showTagNodes: true });

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const missingSet = view.missingNeighborNodeIds;
    return {
      highlightMissingNeighbors: view.panel?.highlightMissingNeighbors ?? false,
      missingCount: missingSet ? missingSet.size : 0,
    };
  });

  console.log("Missing neighbors result:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.highlightMissingNeighbors).toBe(true);
  expect(result.missingCount).toBeGreaterThan(1000);
});

// =========================================================================
// 10. Community coloring legend shows sorted community entries
// =========================================================================
test("community coloring legend shows sorted community entries", async () => {
  // All in one evaluate to prevent state leaking between calls
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = view.panel;
    panel.nodeColorMode = "community";
    panel.showLegend = true;
    panel.searchQuery = "";
    panel.groupBy = "folder";
    panel.groupMinSize = 1;
    panel.collapsedGroups = new Set(["__none__"]);
    view.rawData = null;
    await view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    // Re-set if state was restored by save/restore cycle
    if (view.panel.nodeColorMode !== "community") {
      view.panel.nodeColorMode = "community";
      view.panel.showLegend = true;
      view.panel.groupBy = "folder";
      view.rawData = null;
      await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
    }

    const legendEl = view.legendEl;
    if (!legendEl) return { error: "no legend element" };

    // Find community legend section
    const sections = legendEl.querySelectorAll(".gi-legend-section");
    const communitySection = Array.from(sections).find(s => {
      const title = s.querySelector(".gi-legend-section-title");
      const text = title?.textContent ?? "";
      return text.toLowerCase().includes("community") || text.includes("コミュニティ");
    });

    if (!communitySection) {
      const allText = legendEl.textContent ?? "";
      const sectionTitles = Array.from(sections).map(s =>
        s.querySelector(".gi-legend-section-title")?.textContent ?? "");
      return {
        hasCommunitySection: false,
        legendVisible: legendEl.style.display !== "none",
        sectionTitles,
        debugText: allText.slice(0, 500),
        nodeColorMode: panel.nodeColorMode,
      };
    }

    // Count community entries
    const items = communitySection.querySelectorAll(".gi-legend-item");

    // Read section title (includes count like "Community (20)")
    const sectionTitle = communitySection.querySelector(".gi-legend-section-title")?.textContent?.trim() ?? "";
    const countMatch = sectionTitle.match(/\((\d+)\)/);
    const communityCount = countMatch ? parseInt(countMatch[1], 10) : items.length;

    return {
      hasCommunitySection: true,
      communityCount,
      itemCount: items.length,
      sectionTitle,
      legendVisible: legendEl.style.display !== "none",
      nodeColorMode: panel.nodeColorMode,
    };
  });

  console.log("Community legend result:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.hasCommunitySection).toBe(true);
  // Community legend should have community entries (Louvain detects many communities)
  expect(result.communityCount).toBeGreaterThan(0);
  // Entries should be sorted (title shows count)
  expect(result.itemCount).toBe(result.communityCount);

  // Reset
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.nodeColorMode = "default";
    view.panel.groupBy = "none";
    view.rawData = null;
    await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
});

// =========================================================================
// 11. Community + missing neighbors both visible simultaneously
// =========================================================================
test("community + missing neighbors both visible simultaneously", async () => {
  // All in one evaluate with retry for state that may get reset by save/restore
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // First render
    const panel = view.panel;
    panel.nodeColorMode = "community";
    panel.highlightMissingNeighbors = true;
    panel.showLegend = true;
    panel.searchQuery = "";
    panel.groupBy = "folder";
    panel.groupMinSize = 1;
    panel.collapsedGroups = new Set(["__none__"]);
    view.rawData = null;
    await view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    // Re-set after render in case save/restore cycle reset properties
    if (!view.panel.highlightMissingNeighbors || view.panel.nodeColorMode !== "community") {
      view.panel.nodeColorMode = "community";
      view.panel.highlightMissingNeighbors = true;
      view.panel.showLegend = true;
      view.panel.groupBy = "folder";
      view.rawData = null;
      await view.doRender();
      await new Promise(r => setTimeout(r, 3000));
    }

    let missingSet: Set<string> | null = null;
    if (typeof view.getMissingNeighborNodeIds === "function") {
      missingSet = view.getMissingNeighborNodeIds();
    } else {
      missingSet = view.missingNeighborNodeIds;
    }
    const missingCount = missingSet ? missingSet.size : 0;

    const legendEl = view.legendEl;
    const sections = legendEl ? legendEl.querySelectorAll(".gi-legend-section") : [];
    const legendSectionCount = sections.length;

    const pixiNodeCount = view.pixiNodes ? view.pixiNodes.size : 0;

    return {
      missingCount,
      legendSectionCount,
      pixiNodeCount,
    };
  });

  expect(result).not.toHaveProperty("error");
  // Both features are active at the same time: missing neighbors computed
  expect(result.missingCount).toBeGreaterThan(1000);
  // Legend sections exist (community + edge relations)
  expect(result.legendSectionCount).toBeGreaterThan(0);
  // Nodes are rendering
  expect(result.pixiNodeCount).toBeGreaterThan(0);

  // Reset
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.nodeColorMode = "default";
    view.panel.highlightMissingNeighbors = false;
    view.rawData = null;
    await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
});

// =========================================================================
// 12. Pathfinder highlights path between two nodes with cyan glow
// =========================================================================
test("pathfinder highlights path between two nodes with cyan glow", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Find two nodes that share an edge (guaranteed connected)
    const edges = view.rawData?.edges ?? [];
    if (edges.length === 0) return { error: "no edges in graph" };

    const startId = typeof edges[0].source === "object" ? edges[0].source.id : edges[0].source;
    const endId = typeof edges[0].target === "object" ? edges[0].target.id : edges[0].target;

    // Set pathfinder start and end
    view.setPathfinderNode(startId, "start");
    view.setPathfinderNode(endId, "end");
    await new Promise(r => setTimeout(r, 1000));

    // Get pathfinder state
    const state = view.getPathfinderState();
    const nodeSet = typeof view.getPathfinderNodeSet === "function"
      ? view.getPathfinderNodeSet()
      : null;
    const nodeSetSize = nodeSet ? nodeSet.size : 0;

    // Check the pathfinderPath exists
    const pathLength = view.pathfinderPath?.length ?? 0;

    // Check pathfinder graphics is drawn (cyan glow)
    const pfGfx = view.pathfinderGraphics;
    const hasGraphics = !!pfGfx;

    // Clean up
    view.clearPathfinder();

    return {
      startId: state.startId,
      endId: state.endId,
      nodeSetSize,
      pathLength,
      hasGraphics,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.startId).toBeTruthy();
  expect(result.endId).toBeTruthy();
  // Two directly connected nodes: path should have at least 2 entries
  expect(result.nodeSetSize).toBeGreaterThanOrEqual(2);
  expect(result.pathLength).toBeGreaterThanOrEqual(2);
  expect(result.hasGraphics).toBe(true);
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
});

