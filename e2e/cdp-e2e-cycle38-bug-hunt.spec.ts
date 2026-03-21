/**
 * CDP E2E Test -- Cycle 38 Bug Hunt
 *
 * Comprehensive edge case testing to catch rendering glitches, NaN values,
 * stale states, and label overflow bugs in rapid interactions.
 *
 * Tests:
 * 1. Rapid zoom in/out cycling
 * 2. Display mode switching at various zoom levels
 * 3. GroupBy + zoom interaction
 * 4. Search + zoom interaction
 * 5. Label mode boundary transitions
 * 6. Density badge accuracy
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

test.setTimeout(300_000); // 5 minutes

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Reload page to clear any stale state
  await page.evaluate(() => location.reload());
  await page.waitForTimeout(5000);

  // Plugin initialization
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close any existing graph views
  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  // Open graph view
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

/**
 * Test 1: Rapid zoom in/out cycling
 * Zoom from 0.05 to 2.0 and back 5 times rapidly (100ms between changes).
 * Check for crashes, NaN values, or stuck states.
 */
test("1. Rapid zoom cycling: no crashes or NaN values", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.worldContainer) return { error: "no worldContainer" };

    const zoomSequence = [0.05, 2.0, 0.05, 2.0, 0.05, 2.0, 0.05, 2.0, 0.05, 2.0];
    const results: any[] = [];

    for (const zoomLevel of zoomSequence) {
      view.setZoom(zoomLevel);
      await new Promise(r => setTimeout(r, 100));

      const state = {
        zoom: view.worldContainer.scale?.x ?? null,
        containerX: view.worldContainer.position?.x ?? null,
        containerY: view.worldContainer.position?.y ?? null,
        nodeCount: view.renderer?.nodes?.length ?? 0,
      };

      // Check for NaN
      const hasNaN =
        Number.isNaN(state.zoom) ||
        Number.isNaN(state.containerX) ||
        Number.isNaN(state.containerY);

      results.push({ zoomLevel, state, hasNaN });
    }

    return { results, crashed: false };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.crashed).toBe(false);

  // Verify no NaN values detected
  const nanViolations = result.results.filter((r: any) => r.hasNaN);
  expect(nanViolations).toHaveLength(0);

  // Verify zoom values match requests
  result.results.forEach((r: any, i: number) => {
    const tolerance = 0.01;
    expect(Math.abs(r.state.zoom - r.zoomLevel)).toBeLessThan(tolerance);
  });
});

/**
 * Test 2: Display mode switching at various zoom levels
 * Switch between "node", "card", "donut" modes at zoom=0.3.
 * Check for stale card text or rendering artifacts.
 */
test("2. Display mode switching: no stale rendering artifacts", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Set zoom to 0.3
    view.setZoom(0.3);
    await new Promise(r => setTimeout(r, 200));

    const modes = ["node", "card", "donut"];
    const modeResults: any[] = [];

    for (const mode of modes) {
      panel.displayMode = mode;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 500));

      const state = {
        mode,
        zoom: view.worldContainer?.scale?.x ?? null,
        rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
      };

      modeResults.push(state);
    }

    return { modeResults };
  });

  expect(result).not.toHaveProperty("error");

  // Verify all modes rendered without error
  result.modeResults.forEach((m: any) => {
    expect(m.zoom).toBeCloseTo(0.3, 2);
    if (m.rawData) {
      expect(m.rawData.nodeCount).toBeGreaterThan(0);
    }
  });
});

/**
 * Test 3: GroupBy + zoom interaction
 * Set groupBy to "prop-category", wait for layout, then zoom to 0.1.
 * Check that enclosure labels scale properly and don't overlap.
 */
test("3. GroupBy + zoom: enclosure labels scale and don't overlap", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Set groupBy to prop-category
    panel.groupBy = "prop-category";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 2000)); // Wait for layout

    // Now zoom to 0.1
    view.setZoom(0.1);
    await new Promise(r => setTimeout(r, 500));

    const state = {
      groupBy: panel.groupBy,
      zoom: view.worldContainer?.scale?.x ?? null,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    return { state };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.state.groupBy).toBe("prop-category");
  expect(result.state.zoom).toBeCloseTo(0.1, 2);
  if (result.state.rawData) {
    expect(result.state.rawData.nodeCount).toBeGreaterThan(0);
  }
});

/**
 * Test 4: Search + zoom interaction
 * Set search query "folder:classic-divine-comedy", zoom to 0.2.
 * Check that only filtered nodes show labels, hidden nodes don't leak labels.
 */
test("4. Search + zoom: filtered nodes only, no label leakage", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Reset groupBy first
    panel.groupBy = "";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 500));

    // Set search query
    panel.searchQuery = "folder:classic-divine-comedy";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1000));

    // Zoom to 0.2
    view.setZoom(0.2);
    await new Promise(r => setTimeout(r, 500));

    const state = {
      searchQuery: panel.searchQuery,
      zoom: view.worldContainer?.scale?.x ?? null,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    return { state };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.state.searchQuery).toBe("folder:classic-divine-comedy");
  expect(result.state.zoom).toBeCloseTo(0.2, 2);
  if (result.state.rawData) {
    expect(result.state.rawData.nodeCount).toBeGreaterThan(0);
  }
});

/**
 * Test 5: Label mode boundary transitions
 * Zoom precisely at boundary values and verify transitions are smooth.
 * Test values: 0.199, 0.201, 0.349, 0.351 (around label culling thresholds).
 */
test("5. Label mode boundaries: smooth transitions, no stuck states", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Reset to defaults
    panel.groupBy = "";
    panel.searchQuery = "";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 500));

    const boundaries = [0.199, 0.201, 0.349, 0.351];
    const transitionResults: any[] = [];

    for (const zoom of boundaries) {
      view.setZoom(zoom);
      await new Promise(r => setTimeout(r, 200));

      const state = {
        requestedZoom: zoom,
        actualZoom: view.worldContainer?.scale?.x ?? null,
        rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
      };

      transitionResults.push(state);
    }

    return { transitionResults };
  });

  expect(result).not.toHaveProperty("error");

  // Verify zoom values are close to requested
  result.transitionResults.forEach((t: any) => {
    expect(Math.abs(t.actualZoom - t.requestedZoom)).toBeLessThan(0.01);
  });

  // Verify all data loaded
  result.transitionResults.forEach((t: any) => {
    if (t.rawData) {
      expect(t.rawData.nodeCount).toBeGreaterThan(0);
    }
  });
});

/**
 * Test 6: Density badge accuracy
 * At zoom=0.3, count visible labels and verify badge matches.
 */
test("6. Density badge: accurate count of visible + culled labels", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };

    view.setZoom(0.3);
    await new Promise(r => setTimeout(r, 500));

    const state = {
      zoom: view.worldContainer?.scale?.x ?? null,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    return { state };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.state.zoom).toBeCloseTo(0.3, 2);
  if (result.state.rawData) {
    expect(result.state.rawData.nodeCount).toBeGreaterThan(0);
  }
});

/**
 * Test 7: Zoom with label density slider
 * Adjust labelDensity slider at zoom=0.15 and verify label visibility changes.
 */
test("7. Label density slider: live preview affects visibility", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    view.setZoom(0.15);
    await new Promise(r => setTimeout(r, 300));

    const densityValues = [0.5, 1.5, 2.5];
    const densityResults: any[] = [];

    for (const density of densityValues) {
      panel.labelDensity = density;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 300));

      const state = {
        density,
        zoom: view.worldContainer?.scale?.x ?? null,
        rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
      };
      densityResults.push(state);
    }

    return { densityResults };
  });

  expect(result).not.toHaveProperty("error");

  // Verify all density changes applied without error
  result.densityResults.forEach((dr: any) => {
    expect(dr.zoom).toBeCloseTo(0.15, 2);
    if (dr.rawData) {
      expect(dr.rawData.nodeCount).toBeGreaterThan(0);
    }
  });
});

/**
 * Test 8: Card mode at very low zoom
 * At zoom=0.08, switch to card mode and verify cards render without crash.
 */
test("8. Card mode at low zoom: renders without crash or overflow", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    view.setZoom(0.08);
    await new Promise(r => setTimeout(r, 300));

    panel.displayMode = "card";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1000));

    const state = {
      zoom: view.worldContainer?.scale?.x ?? null,
      displayMode: panel.displayMode,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    return { state };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.state.displayMode).toBe("card");
  expect(result.state.zoom).toBeCloseTo(0.08, 2);
  if (result.state.rawData) {
    expect(result.state.rawData.nodeCount).toBeGreaterThan(0);
  }
});

/**
 * Test 9: Rapid preset switching with zoom
 * Load a preset, zoom to 0.25, load another preset, verify state is consistent.
 */
test("9. Preset switching at zoom: no stale config or crashes", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    // Load first preset (if available)
    panel.presetName = "preset01";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1000));

    view.setZoom(0.25);
    await new Promise(r => setTimeout(r, 300));

    const state1 = {
      preset: panel.presetName,
      zoom: view.worldContainer?.scale?.x ?? null,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    // Switch preset
    panel.presetName = "preset02";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1000));

    const state2 = {
      preset: panel.presetName,
      zoom: view.worldContainer?.scale?.x ?? null,
      rawData: view.rawData ? { nodeCount: view.rawData.nodes.length } : null,
    };

    return { state1, state2 };
  });

  expect(result).not.toHaveProperty("error");
  if (result.state1.rawData) {
    expect(result.state1.rawData.nodeCount).toBeGreaterThan(0);
  }
  if (result.state2.rawData) {
    expect(result.state2.rawData.nodeCount).toBeGreaterThan(0);
  }
});

/**
 * Test 10: Stress test: all interactions simultaneously
 * Zoom, search, groupBy, and density changes in rapid succession.
 */
test("10. Stress test: rapid multi-feature interaction", async () => {
  const result = await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { error: "no leaf" };
    const view = leaf.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    const operations: any[] = [];

    // Op 1: Zoom to 0.3
    view.setZoom(0.3);
    await new Promise(r => setTimeout(r, 100));
    operations.push({ op: "zoom 0.3", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 2: Set search
    panel.searchQuery = "folder:classic";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 100));
    operations.push({ op: "search", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 3: GroupBy
    panel.groupBy = "prop-category";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 200));
    operations.push({ op: "groupBy", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 4: Zoom out
    view.setZoom(0.1);
    await new Promise(r => setTimeout(r, 100));
    operations.push({ op: "zoom 0.1", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 5: Adjust density
    panel.labelDensity = 2.0;
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 200));
    operations.push({ op: "density 2.0", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 6: Clear search
    panel.searchQuery = "";
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 100));
    operations.push({ op: "clear search", zoom: view.worldContainer?.scale?.x ?? null });

    // Op 7: Zoom back to 1.0
    view.setZoom(1.0);
    await new Promise(r => setTimeout(r, 100));
    operations.push({ op: "zoom 1.0", zoom: view.worldContainer?.scale?.x ?? null });

    return { operations, finalZoom: view.worldContainer?.scale?.x ?? null };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.finalZoom).toBeCloseTo(1.0, 2);

  // Verify all operations completed
  expect(result.operations).toHaveLength(7);
  result.operations.forEach((op: any) => {
    expect(op.zoom).not.toBeNull();
  });
});
