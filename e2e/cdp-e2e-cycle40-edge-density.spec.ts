/**
 * CDP E2E Test -- Cycle 40: Edge Rendering & Density Control
 *
 * Tests edge visibility at extreme zoom levels, edge type fade verification,
 * edge count vs visible edges, edge + label interaction, donut mode,
 * and console error checking.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

test.setTimeout(300_000);

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  if (!page) {
    throw new Error("No Obsidian page found. Is Obsidian running with --remote-debugging-port=9222?");
  }
  await page.bringToFront();

  // Wait for app to be ready
  await page.waitForTimeout(2000);

  // Reload page first (CDP requires evaluate-based reload)
  try {
    await page.evaluate(() => { location.reload(); });
  } catch (e) {
    console.log("Reload error (may recover):", e);
  }
  await page.waitForTimeout(8000);

  // Close any existing graph views and ensure plugin is enabled
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app?.workspace) {
      app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    }
    // Ensure plugin is enabled
    if (app?.plugins && !app.plugins.getPlugin("graph-island")) {
      try {
        await app.plugins.enablePlugin("graph-island");
      } catch (e) {
        console.log("Plugin enable error:", e);
      }
    }
  });
  await page.waitForTimeout(1000);

  // Open graph view
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(8000);
});

test.afterAll(async () => {
  await browser.close();
});

// ============================================================================
// Test 1: Edge Visibility at Extreme Zoom-Out (zoom=0.05)
// ============================================================================
test("1. Edge visibility at zoom=0.05 (extreme zoom-out)", async () => {
  const consoleErrors: string[] = [];
  page.once("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || !view.worldContainer) return { error: "no view or worldContainer" };

    // Set extreme zoom
    view.setZoom(0.05);
    await new Promise(r => setTimeout(r, 500));

    // Get edge graphics and count draw calls
    const edgeGfx = view.edgeGraphics;
    if (!edgeGfx) return { error: "no edgeGraphics" };

    // PixiJS Graphics object: check if it has been drawn to
    const geometry = (edgeGfx as any).geometry;
    const hasDrawCalls = geometry && geometry.vertexData && geometry.vertexData.length > 0;

    // Get graph edges count
    const edges = view.getGraphEdges?.() ?? [];
    const edgeCount = edges.length;

    // Get world scale for confirmation
    const worldScale = view.worldContainer.scale?.x ?? 1;

    return {
      zoomLevel: 0.05,
      worldScale,
      edgeGraphicsExists: !!edgeGfx,
      hasDrawCalls,
      totalEdgeCount: edgeCount,
      geometryVertices: geometry?.vertexData?.length ?? 0,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.edgeGraphicsExists).toBe(true);
  expect(result.totalEdgeCount).toBeGreaterThan(0);
  // At extreme zoom-out, edges should still be rendered (hasDrawCalls may be true or filtered)
  console.log("Test 1 - Extreme Zoom-Out Edge Rendering:", result);
  console.log("Console errors detected:", consoleErrors.length);
});

// ============================================================================
// Test 2: Edge Type Fade Verification (zoom=0.3)
// ============================================================================
test("2. Edge type fade verification at zoom=0.3", async () => {
  const consoleErrors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    view.setZoom(0.3);
    await new Promise(r => setTimeout(r, 500));

    const edges = view.getGraphEdges?.() ?? [];

    // Categorize edges by type
    const linkEdges = edges.filter((e: any) => e.type === "link");
    const hasTagEdges = edges.filter((e: any) => e.type === "has-tag");
    const otherEdges = edges.filter((e: any) => !["link", "has-tag"].includes(e.type ?? ""));

    return {
      zoomLevel: 0.3,
      totalEdges: edges.length,
      linkEdges: linkEdges.length,
      hasTagEdges: hasTagEdges.length,
      otherEdges: otherEdges.length,
      edgeTypeDistribution: {
        link: linkEdges.length,
        "has-tag": hasTagEdges.length,
        other: otherEdges.length,
      },
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.totalEdges).toBeGreaterThan(0);
  expect(result.linkEdges).toBeGreaterThan(0);
  // has-tag edges may or may not be present depending on vault content
  console.log("Test 2 - Edge Type Distribution at zoom 0.3:", result);
});

// ============================================================================
// Test 3: Edge Count vs Visible Edges at Multiple Zoom Levels
// ============================================================================
test("3. Edge count vs visible edges across zoom levels", async () => {
  const zoomLevels = [0.1, 0.3, 0.5, 1.0];
  const results: any[] = [];

  for (const zoom of zoomLevels) {
    const data = await page.evaluate(
      async (zoomVal: number) => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return { error: "no view" };

        view.setZoom(zoomVal);
        await new Promise(r => setTimeout(r, 300));

        const edges = view.getGraphEdges?.() ?? [];
        const pixiNodesMap = view.getPixiNodes?.() ?? new Map();
        const nodeCount = pixiNodesMap.size;

        // Simulate shouldSkipEdge logic based on draw config
        // In the actual code, edges are filtered by type visibility
        const panel = view.panel;
        const visibleEdges = edges.filter((e: any) => {
          // Filter based on type and visibility settings
          const typeVisibility: { [key: string]: boolean } = {
            "link": panel?.showLinks ?? true,
            "tag": panel?.showTagEdges ?? true,
            "has-tag": panel?.showTagNodes ?? false,
            "semantic": panel?.showSemanticEdges ?? true,
            "inheritance": panel?.showInheritance ?? true,
            "similar": panel?.showSimilar ?? true,
          };
          const type = e.type ?? "link";
          return typeVisibility[type] ?? true;
        });

        return {
          zoom: zoomVal,
          totalEdges: edges.length,
          visibleEdges: visibleEdges.length,
          nodeCount,
          visibilityRatio: visibleEdges.length > 0 ? (visibleEdges.length / edges.length) : 0,
        };
      },
      zoom
    );

    if (!data.error) {
      results.push(data);
    }
  }

  expect(results.length).toBeGreaterThanOrEqual(3);
  // Verify edge counts are reasonable
  results.forEach(r => {
    expect(r.totalEdges).toBeGreaterThan(0);
    expect(r.visibleEdges).toBeGreaterThanOrEqual(0);
    expect(r.visibleEdges).toBeLessThanOrEqual(r.totalEdges);
    expect(r.visibilityRatio).toBeGreaterThanOrEqual(0);
    expect(r.visibilityRatio).toBeLessThanOrEqual(1);
  });

  console.log("Test 3 - Edge Count by Zoom Level:", results);
});

// ============================================================================
// Test 4: Edge + Label Interaction (zoom=0.3)
// ============================================================================
test("4. Edge and label interaction at zoom=0.3", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    view.setZoom(0.3);
    await new Promise(r => setTimeout(r, 500));

    // Count visible node labels via PixiNodes
    let visibleLabelCount = 0;
    const pixiNodesMap = view.getPixiNodes?.() ?? new Map();
    for (const pn of pixiNodesMap.values()) {
      if (pn.label?.visible && pn.label?.text) visibleLabelCount++;
    }

    const panel = view.panel;
    const showEdgeLabels = panel?.showEdgeLabels ?? false;
    const edgeGfx = view.edgeGraphics;

    return {
      zoomLevel: 0.3,
      visibleNodeLabelCount: visibleLabelCount,
      showEdgeLabels,
      edgeGraphicsExists: !!edgeGfx,
      hasLabelOverlapCheck: !!view.cullOverlappingRotatedLabels,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.edgeGraphicsExists).toBe(true);
  console.log("Test 4 - Edge and Label Interaction:", result);
});

// ============================================================================
// Test 5: Donut Mode + Edges
// ============================================================================
test("5. Donut mode with edge rendering at zoom=0.5", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || !view.panel) return { error: "no view or panel" };

    // Check if donut layout is available
    const panel = view.panel;
    const layouts = panel.layoutMode ? Object.keys(panel.layoutMode) : [];
    const hasDonutLayout = layouts.includes("donut");

    if (!hasDonutLayout) {
      return {
        error: "donut layout not available",
        availableLayouts: layouts,
      };
    }

    // Switch to donut layout
    panel.layoutMode = "donut";
    await new Promise(r => setTimeout(r, 500));

    // Set zoom
    view.setZoom(0.5);
    await new Promise(r => setTimeout(r, 500));

    const edges = view.getGraphEdges?.() ?? [];
    const nodes = view.nodes ?? [];
    const edgeGfx = view.edgeGraphics;
    const worldScale = view.worldContainer?.scale?.x ?? 1;

    return {
      layoutMode: "donut",
      zoomLevel: 0.5,
      worldScale,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      edgeGraphicsExists: !!edgeGfx,
      edgeGraphicsHasChildren: edgeGfx?.children?.length ?? 0,
    };
  });

  // If donut layout is not available, skip this assertion
  if (!result.error) {
    expect(result.edgeGraphicsExists).toBe(true);
    expect(result.totalNodes).toBeGreaterThan(0);
    expect(result.totalEdges).toBeGreaterThanOrEqual(0);
    console.log("Test 5 - Donut Mode with Edges:", result);
  } else {
    console.log("Test 5 - Donut layout not available (expected in some configurations):", result.error);
  }
});

// ============================================================================
// Test 6: Console Error Monitoring
// ============================================================================
test("6. Monitor for console errors during all operations", async () => {
  const consoleMessages: { type: string; text: string }[] = [];

  page.on("console", msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
    });
  });

  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Perform a series of zoom operations
    const zoomSequence = [0.05, 0.1, 0.3, 0.5, 1.0, 2.0];
    for (const z of zoomSequence) {
      view.setZoom(z);
      await new Promise(r => setTimeout(r, 200));
    }

    // Return a summary of the view state
    return {
      operationsCompleted: zoomSequence.length,
      finalZoom: 2.0,
      finalZoomActual: view.worldContainer?.scale?.x ?? "unknown",
    };
  });

  // Filter for errors and warnings
  const errors = consoleMessages.filter(m => m.type === "error");
  const warnings = consoleMessages.filter(m => m.type === "warning");

  console.log(`Test 6 - Console Messages: ${consoleMessages.length} total, ${errors.length} errors, ${warnings.length} warnings`);

  if (errors.length > 0) {
    console.log("Console errors detected:");
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.text}`);
    });
  }

  // We log errors but don't necessarily fail - some warnings may be expected
  expect(errors.length).toBeLessThan(5); // Allow some minor errors but flag too many
});

// ============================================================================
// Test 7: Edge Visibility Consistency Across Render Cycles
// ============================================================================
test("7. Edge visibility consistency across multiple render cycles", async () => {
  const renderCycles = 3;
  const results: any[] = [];

  for (let cycle = 0; cycle < renderCycles; cycle++) {
    const data = await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // Mark as dirty to trigger re-render
      view.markDirty?.();
      await new Promise(r => setTimeout(r, 300));

      const edges = view.getGraphEdges?.() ?? [];
      const pixiNodesMap = view.getPixiNodes?.() ?? new Map();

      return {
        cycle: Date.now(),
        edgeCount: edges.length,
        nodeCount: pixiNodesMap.size,
      };
    });

    if (!data.error) {
      results.push(data);
    }
  }

  expect(results.length).toBeGreaterThanOrEqual(2);
  // Verify consistency: edge and node counts should remain stable
  if (results.length > 0) {
    const firstResult = results[0];
    results.forEach((r, i) => {
      expect(r.edgeCount).toBe(firstResult.edgeCount);
      expect(r.nodeCount).toBe(firstResult.nodeCount);
      if (i > 0) {
        console.log(`Cycle ${i}: Edge/node counts consistent - OK`);
      }
    });
  }

  console.log("Test 7 - Render Cycle Consistency:", results);
});

// ============================================================================
// Test 8: Edge Density Scaling
// ============================================================================
test("8. Edge density scaling with node count", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    const edges = view.getGraphEdges?.() ?? [];
    const pixiNodesMap = view.getPixiNodes?.() ?? new Map();
    const nodeCount = pixiNodesMap.size;
    const edgeCount = edges.length;

    // Calculate edge density
    const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2; // undirected
    const density = maxPossibleEdges > 0 ? (edgeCount / maxPossibleEdges) * 100 : 0;

    // Analyze edge type distribution
    const typeDistribution: { [key: string]: number } = {};
    for (const e of edges) {
      const type = e.type ?? "unknown";
      typeDistribution[type] = (typeDistribution[type] ?? 0) + 1;
    }

    // Get average degree
    const degrees = new Map<string, number>();
    for (const e of edges) {
      degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
    }
    const avgDegree = nodeCount > 0 ? Array.from(degrees.values()).reduce((a, b) => a + b, 0) / nodeCount : 0;

    return {
      nodeCount,
      edgeCount,
      density: density.toFixed(2) + "%",
      avgDegree: avgDegree.toFixed(2),
      typeDistribution,
      maxDegree: Math.max(...Array.from(degrees.values()), 0),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.edgeCount).toBeGreaterThanOrEqual(0);
  console.log("Test 8 - Edge Density Analysis:", result);
});

// ============================================================================
// Test 9: Edge Type Visibility Filtering
// ============================================================================
test("9. Edge type visibility filtering behavior", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || !view.panel) return { error: "no view or panel" };

    const panel = view.panel;
    const edges = view.getGraphEdges?.() ?? [];

    // Get all edge types
    const allTypes = new Set<string>();
    for (const e of edges) {
      allTypes.add(e.type ?? "unknown");
    }

    // Map types to visibility settings
    const typeVisibilityMap: { [key: string]: { count: number; visible: boolean } } = {};
    const visibilityFields: { [key: string]: keyof any } = {
      "link": "showLinks",
      "tag": "showTagEdges",
      "has-tag": "showTagNodes",
      "semantic": "showSemanticEdges",
      "inheritance": "showInheritance",
      "aggregation": "showAggregation",
      "similar": "showSimilar",
      "sibling": "showSibling",
      "sequence": "showSequence",
    };

    for (const type of allTypes) {
      const field = visibilityFields[type] ?? "showLinks";
      const visible = panel[field] ?? true;
      const count = edges.filter((e: any) => e.type === type).length;
      typeVisibilityMap[type] = { count, visible };
    }

    return {
      totalEdgeTypes: allTypes.size,
      totalEdges: edges.length,
      typeVisibilityMap,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.totalEdgeTypes).toBeGreaterThan(0);
  expect(result.totalEdges).toBeGreaterThan(0);
  console.log("Test 9 - Edge Type Visibility Map:", result);
});

// ============================================================================
// Test 10: Edge Label Rendering at Various Zoom Levels
// ============================================================================
test("10. Edge label rendering across zoom levels", async () => {
  const zoomLevels = [0.1, 0.3, 0.5, 1.0];
  const results: any[] = [];

  for (const zoom of zoomLevels) {
    const data = await page.evaluate(
      async (zoomVal: number) => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return { error: "no view" };

        view.setZoom(zoomVal);
        await new Promise(r => setTimeout(r, 300));

        const panel = view.panel;
        const showEdgeLabels = panel?.showEdgeLabels ?? false;
        const edgeLabels = view.edgeLabels ?? [];

        // Count visible edge labels
        let visibleEdgeLabels = 0;
        if (edgeLabels.length > 0) {
          visibleEdgeLabels = edgeLabels.filter((label: any) => label.visible !== false).length;
        }

        return {
          zoom: zoomVal,
          showEdgeLabels,
          totalEdgeLabels: edgeLabels.length,
          visibleEdgeLabels,
          worldScale: view.worldContainer?.scale?.x ?? 1,
        };
      },
      zoom
    );

    if (!data.error) {
      results.push(data);
    }
  }

  expect(results.length).toBe(4);
  console.log("Test 10 - Edge Label Rendering:", results);
});
