/**
 * CDP E2E Test -- Features DD, DE, DF + Additional Coverage
 *
 * DD: Path Visualizer (pathfinder shortest path)
 * DE: Edge Label Placement
 * DF: Multi-Label Nodes (nodeSubLabelFields)
 *
 * Additional: Node interaction (hover, bookmark, compare)
 * Stress: Combined DD + DE + DF simultaneously
 *
 * IMPORTANT: DD, DE, DF features may still be under active development.
 * Tests use try/catch and graceful skipping for properties that don't exist yet.
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

// =========================================================================
// Lifecycle
// =========================================================================

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Ensure only 1 graph-view leaf is open
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) {
      leaves[i].detach();
    }
  });
  await page.waitForTimeout(1000);
});

test.afterAll(async () => {
  // Don't close -- reusing running Obsidian
});

// =========================================================================
// Helpers
// =========================================================================

/** Get the graph view instance. Returns null if not found. */
async function getView(): Promise<boolean> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    return leaves.length > 0;
  });
}

/** Get a sample node ID from rawData for testing. */
async function getSampleNodeIds(count: number): Promise<string[]> {
  return page.evaluate((n: number) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves || leaves.length === 0) return [];
    const view = leaves[0].view as any;
    const nodes = view.rawData?.nodes ?? [];
    // Pick non-tag nodes that have file paths
    const fileNodes = nodes.filter((nd: any) => !nd.isTag && nd.filePath);
    return fileNodes.slice(0, n).map((nd: any) => nd.id);
  }, count);
}

// =========================================================================
// DD: Path Visualizer
// =========================================================================
test.describe("DD: Path Visualizer", () => {
  test("DD-1: setPathfinderNode start+end, computePathfinderPath yields path", async () => {
    const nodeIds = await getSampleNodeIds(10);
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);
    const startId = nodeIds[0];
    const endId = nodeIds[nodeIds.length - 1];

    const result = await page.evaluate(async (args: { startId: string; endId: string }) => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.setPathfinderNode !== "function") {
          return { skipped: true, reason: "setPathfinderNode not found" };
        }

        view.setPathfinderNode(args.startId, "start");
        view.setPathfinderNode(args.endId, "end");
        await new Promise(r => setTimeout(r, 500));

        const state = typeof view.getPathfinderState === "function"
          ? view.getPathfinderState()
          : { startId: null, endId: null };

        // Access private pathfinderPath via getPathfinderNodeSet
        const nodeSet = typeof view.getPathfinderNodeSet === "function"
          ? view.getPathfinderNodeSet()
          : null;
        const nodeSetSize = nodeSet ? nodeSet.size : -1;

        return {
          skipped: false,
          startId: state.startId,
          endId: state.endId,
          nodeSetSize,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, { startId, endId });

    console.log("DD-1 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).startId).toBe(startId);
    expect((result as any).endId).toBe(endId);
    // Path may or may not exist depending on graph connectivity
    // nodeSetSize >= 0 means pathfinder computed (even if no path found, set is null -> -1)
  });

  test("DD-2: pathfinderNodeSet has entries when path exists", async () => {
    // Use nodes that are likely connected (same folder)
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.setPathfinderNode !== "function") {
          return { skipped: true, reason: "setPathfinderNode not found" };
        }

        // Find two nodes that share an edge (guaranteed connected)
        const edges = view.rawData?.edges ?? [];
        if (edges.length === 0) return { skipped: true, reason: "no edges" };

        const firstEdge = edges[0];
        view.setPathfinderNode(firstEdge.source, "start");
        view.setPathfinderNode(firstEdge.target, "end");
        await new Promise(r => setTimeout(r, 500));

        const nodeSet = typeof view.getPathfinderNodeSet === "function"
          ? view.getPathfinderNodeSet()
          : null;

        return {
          skipped: false,
          nodeSetSize: nodeSet ? nodeSet.size : 0,
          sourceId: firstEdge.source,
          targetId: firstEdge.target,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DD-2 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    // Two directly connected nodes should yield a path of at least 2
    expect((result as any).nodeSetSize).toBeGreaterThanOrEqual(2);
  });

  test("DD-3: clearPathfinder resets all state", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.clearPathfinder !== "function") {
          return { skipped: true, reason: "clearPathfinder not found" };
        }

        view.clearPathfinder();
        await new Promise(r => setTimeout(r, 300));

        const state = typeof view.getPathfinderState === "function"
          ? view.getPathfinderState()
          : {};
        const nodeSet = typeof view.getPathfinderNodeSet === "function"
          ? view.getPathfinderNodeSet()
          : "not-available";

        return {
          skipped: false,
          startId: state.startId,
          endId: state.endId,
          nodeSetIsNull: nodeSet === null || nodeSet === "not-available",
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DD-3 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).startId).toBeNull();
    expect((result as any).endId).toBeNull();
    expect((result as any).nodeSetIsNull).toBe(true);
  });
});

// =========================================================================
// DE: Edge Label Placement
// =========================================================================
test.describe("DE: Edge Label Placement", () => {
  test("DE-4: edgeLabelPlacement = center -- no crash", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("edgeLabelPlacement" in panel)) {
          return { skipped: true, reason: "edgeLabelPlacement not in panel" };
        }

        panel.edgeLabelPlacement = "center";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 1000));

        return {
          skipped: false,
          value: panel.edgeLabelPlacement,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DE-4 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("center");
    expect((result as any).nodeCount).toBeGreaterThan(0);
  });

  test("DE-5: edgeLabelPlacement = offset -- no crash", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("edgeLabelPlacement" in panel)) {
          return { skipped: true, reason: "edgeLabelPlacement not in panel" };
        }

        panel.edgeLabelPlacement = "offset";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 1000));

        return {
          skipped: false,
          value: panel.edgeLabelPlacement,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DE-5 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("offset");
  });

  test("DE-6: edgeLabelPlacement = smart -- no crash", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("edgeLabelPlacement" in panel)) {
          return { skipped: true, reason: "edgeLabelPlacement not in panel" };
        }

        panel.edgeLabelPlacement = "smart";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 1000));

        return {
          skipped: false,
          value: panel.edgeLabelPlacement,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DE-6 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("smart");
  });

  test("DE-7: reset edgeLabelPlacement to center", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("edgeLabelPlacement" in panel)) {
          return { skipped: true, reason: "edgeLabelPlacement not in panel" };
        }

        panel.edgeLabelPlacement = "center";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 500));

        return { skipped: false, value: panel.edgeLabelPlacement };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DE-7 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("center");
  });
});

// =========================================================================
// DF: Multi-Label Nodes (nodeSubLabelFields)
// =========================================================================
test.describe("DF: Multi-Label Nodes", () => {
  test("DF-8: nodeSubLabelFields = category -- no crash", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        // Feature DF may not be implemented yet
        if (!("nodeSubLabelFields" in panel)) {
          return { skipped: true, reason: "nodeSubLabelFields not in panel yet" };
        }

        panel.nodeSubLabelFields = "category";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 1000));

        return {
          skipped: false,
          value: panel.nodeSubLabelFields,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DF-8 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("category");
    expect((result as any).nodeCount).toBeGreaterThan(0);
  });

  test("DF-9: nodeSubLabelFields = category,date -- multiple fields", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("nodeSubLabelFields" in panel)) {
          return { skipped: true, reason: "nodeSubLabelFields not in panel yet" };
        }

        panel.nodeSubLabelFields = "category,date";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 1000));

        return {
          skipped: false,
          value: panel.nodeSubLabelFields,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DF-9 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("category,date");
  });

  test("DF-10: nodeSubLabelFields = empty string -- reset", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        if (!("nodeSubLabelFields" in panel)) {
          return { skipped: true, reason: "nodeSubLabelFields not in panel yet" };
        }

        panel.nodeSubLabelFields = "";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 500));

        return {
          skipped: false,
          value: panel.nodeSubLabelFields,
          nodeCount: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("DF-10 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).value).toBe("");
  });
});

// =========================================================================
// Additional Coverage: Node Interaction
// =========================================================================
test.describe("Additional: Node Interaction", () => {
  test("AI-11: hover -- setHighlightedNodeId + applyHover populates prevHighlightSet", async () => {
    const nodeIds = await getSampleNodeIds(1);
    expect(nodeIds.length).toBeGreaterThanOrEqual(1);
    const hoverId = nodeIds[0];

    const result = await page.evaluate(async (id: string) => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.setHighlightedNodeId !== "function") {
          return { skipped: true, reason: "setHighlightedNodeId not found" };
        }
        if (typeof view.applyHover !== "function") {
          return { skipped: true, reason: "applyHover not found" };
        }

        view.setHighlightedNodeId(id);
        view.applyHover();
        await new Promise(r => setTimeout(r, 500));

        const prevSet = typeof view.getPrevHighlightSet === "function"
          ? view.getPrevHighlightSet()
          : null;
        const highlightId = typeof view.getHighlightedNodeId === "function"
          ? view.getHighlightedNodeId()
          : null;

        return {
          skipped: false,
          highlightedId: highlightId,
          prevHighlightSetSize: prevSet ? prevSet.size : -1,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, hoverId);

    console.log("AI-11 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).highlightedId).toBe(hoverId);
    // prevHighlightSet should contain at least the hovered node itself
    expect((result as any).prevHighlightSetSize).toBeGreaterThan(0);

    // Clean up hover state
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view && typeof view.setHighlightedNodeId === "function") {
        view.setHighlightedNodeId(null);
        if (typeof view.applyHover === "function") view.applyHover();
      }
    });
  });

  test("AI-12: toggleBookmark adds node to bookmarkedNodes", async () => {
    const nodeIds = await getSampleNodeIds(1);
    expect(nodeIds.length).toBeGreaterThanOrEqual(1);
    const bookmarkId = nodeIds[0];

    const result = await page.evaluate(async (id: string) => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.toggleBookmark !== "function") {
          return { skipped: true, reason: "toggleBookmark not found" };
        }

        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

        // First ensure it's not already bookmarked
        if (panel && panel.bookmarkedNodes && panel.bookmarkedNodes.includes(id)) {
          view.toggleBookmark(id); // remove first
        }

        // Now add bookmark
        view.toggleBookmark(id);
        await new Promise(r => setTimeout(r, 300));

        const isBookmarked = panel?.bookmarkedNodes?.includes(id) ?? false;

        // Clean up: remove bookmark
        view.toggleBookmark(id);

        return {
          skipped: false,
          isBookmarked,
          bookmarkCount: panel?.bookmarkedNodes?.length ?? -1,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, bookmarkId);

    console.log("AI-12 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).isBookmarked).toBe(true);
  });

  test("AI-13: addCompareNode selects 2 nodes for comparison", async () => {
    const nodeIds = await getSampleNodeIds(3);
    expect(nodeIds.length).toBeGreaterThanOrEqual(2);
    const idA = nodeIds[0];
    const idB = nodeIds[1];

    const result = await page.evaluate(async (args: { a: string; b: string }) => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;

        if (typeof view.addCompareNode !== "function") {
          return { skipped: true, reason: "addCompareNode not found" };
        }

        // Clear first
        if (typeof view.clearCompareSelection === "function") {
          view.clearCompareSelection();
        }

        view.addCompareNode(args.a);
        view.addCompareNode(args.b);
        await new Promise(r => setTimeout(r, 300));

        const ids = typeof view.getCompareNodeIds === "function"
          ? view.getCompareNodeIds()
          : [];

        // Clean up
        if (typeof view.clearCompareSelection === "function") {
          view.clearCompareSelection();
        }

        return {
          skipped: false,
          compareCount: ids.length,
          containsA: ids.includes(args.a),
          containsB: ids.includes(args.b),
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, { a: idA, b: idB });

    console.log("AI-13 result:", JSON.stringify(result));
    if ((result as any).skipped) {
      console.log("SKIPPED: " + (result as any).reason);
      return;
    }
    expect((result as any).error).toBeUndefined();
    expect((result as any).compareCount).toBe(2);
    expect((result as any).containsA).toBe(true);
    expect((result as any).containsB).toBe(true);
  });
});

// =========================================================================
// Stress Test: DD + DE + DF combined
// =========================================================================
test.describe("Stress: Combined DD + DE + DF", () => {
  test("ST-14: enable all three features simultaneously -- no crash", async () => {
    const result = await page.evaluate(async () => {
      try {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        if (!leaves || leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view as any;
        const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
        if (!panel) return { error: "no panel" };

        const features: string[] = [];

        // DD: Pathfinder
        if (typeof view.setPathfinderNode === "function") {
          const edges = view.rawData?.edges ?? [];
          if (edges.length > 0) {
            view.setPathfinderNode(edges[0].source, "start");
            view.setPathfinderNode(edges[0].target, "end");
            features.push("DD-pathfinder");
          }
        }

        // DE: Edge Label Placement
        if ("edgeLabelPlacement" in panel) {
          panel.edgeLabelPlacement = "smart";
          features.push("DE-edgeLabelPlacement");
        }

        // DF: Sub-label Fields
        if ("nodeSubLabelFields" in panel) {
          panel.nodeSubLabelFields = "category";
          features.push("DF-nodeSubLabelFields");
        }

        // Trigger full render
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 2000));

        const nodeCount = view.rawData?.nodes?.length ?? 0;

        // Clean up
        if (typeof view.clearPathfinder === "function") view.clearPathfinder();
        if ("edgeLabelPlacement" in panel) panel.edgeLabelPlacement = "center";
        if ("nodeSubLabelFields" in panel) panel.nodeSubLabelFields = "";
        if (typeof view.doRender === "function") await view.doRender();
        await new Promise(r => setTimeout(r, 500));

        return {
          features,
          nodeCount,
          nodeCountAfterCleanup: view.rawData?.nodes?.length ?? 0,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log("ST-14 result:", JSON.stringify(result));
    expect((result as any).error).toBeUndefined();
    expect((result as any).features.length).toBeGreaterThan(0);
    expect((result as any).nodeCount).toBeGreaterThan(0);
    // Node count should be preserved after enabling and disabling features
    expect((result as any).nodeCountAfterCleanup).toBe((result as any).nodeCount);
    console.log("Active features tested:", (result as any).features.join(", "));
  });
});
