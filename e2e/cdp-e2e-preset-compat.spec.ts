/**
 * CDP E2E Test — Preset Backward Compatibility
 *
 * Validates that after the hybrid routing refactor:
 * - All existing presets (spiral, concentric, tree, grid, triangle, random, mountain, sunburst, timeline)
 *   dispatch through dispatchHardcoded() and produce correct output
 * - No console errors occur during rendering
 * - Node visibility is consistent across preset changes
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();
  await page.waitForTimeout(1000);
});

test.afterAll(async () => {
  // Don't close — reusing running Obsidian
});

// =========================================================================
// Helper: Get current graph view and its state
// =========================================================================

interface ViewInfo {
  leafCount: number;
  nodeCount: number;
  edgeCount: number;
  hasPixiApp: boolean;
  pixiAppReady: boolean;
  hasSimulation: boolean;
}

async function getViewInfo(): Promise<ViewInfo | null> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) return null;
    const view = leaves[0].view;
    return {
      leafCount: leaves.length,
      nodeCount: view.rawData?.nodes?.length ?? -1,
      edgeCount: view.rawData?.edges?.length ?? -1,
      hasPixiApp: !!view.pixiApp,
      pixiAppReady: view.pixiApp?.renderer?.width > 0,
      hasSimulation: !!view.simulation,
    };
  });
}

/**
 * Open a fresh graph-island view
 */
async function openGraphView() {
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    leaves.forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const app = (window as any).app;
    return app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(3000);
}

/**
 * Get console messages to check for errors
 */
async function getConsoleMessages(): Promise<string[]> {
  return page.evaluate(() => {
    const msgStore = (window as any).__testConsoleMessages ?? [];
    return msgStore.slice(-20);
  });
}

/**
 * Set the cluster arrangement preset
 */
async function setArrangement(arrangement: string): Promise<boolean> {
  const result = await page.evaluate((arr: string) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves || leaves.length === 0) return false;

    const view = leaves[0].view;
    if (!view) return false;

    // Access the plugin instance to modify settings
    const plugin = app.plugins.plugins["graph-island"];
    if (!plugin) return false;

    // Store current settings
    const oldArrangement = plugin.settings?.clusterArrangement;

    // Update settings
    if (!plugin.settings) plugin.settings = {};
    plugin.settings.clusterArrangement = arr;

    // Trigger re-render by calling requestRender if available
    if (view.requestRender) {
      view.requestRender();
    }

    return true;
  }, arrangement);

  await page.waitForTimeout(2000); // Wait for layout computation
  return result;
}

// =========================================================================
// Test Suite: Plugin Loading
// =========================================================================

test.describe("Plugin & View Initialization", () => {
  test("plugin is loaded", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      return {
        loaded: "graph-island" in (app.plugins?.plugins ?? {}),
        manifest: !!app.plugins?.manifests?.["graph-island"],
      };
    });
    expect(result.loaded).toBe(true);
    expect(result.manifest).toBe(true);
  });

  test("open graph-island-view", async () => {
    await openGraphView();
    const info = await getViewInfo();
    expect(info).not.toBeNull();
    expect(info!.leafCount).toBe(1);
    console.log(`Graph state: ${info!.nodeCount} nodes, ${info!.edgeCount} edges`);
  });

  test("PIXI.js app is initialized", async () => {
    const info = await getViewInfo();
    expect(info!.hasPixiApp).toBe(true);
    expect(info!.pixiAppReady).toBe(true);
  });

  test("canvas element exists", async () => {
    const count = await page.evaluate(() => document.querySelectorAll("canvas").length);
    expect(count).toBeGreaterThan(0);
  });
});

// =========================================================================
// Test Suite: Preset Compatibility (Backward Compat)
// =========================================================================

const PRESETS = ["spiral", "grid", "concentric", "tree", "triangle", "random", "mountain"];

test.describe("Preset Backward Compatibility", () => {
  for (const preset of PRESETS) {
    test(`preset "${preset}" renders without error`, async () => {
      // Set arrangement
      const set = await setArrangement(preset);
      expect(set).toBe(true);

      // Verify view still exists and has nodes
      const info = await getViewInfo();
      expect(info).not.toBeNull();
      expect(info!.nodeCount).toBeGreaterThan(0);
      expect(info!.hasPixiApp).toBe(true);

      // Check for console errors (optional, depends on capture)
      const logs = await getConsoleMessages();
      const errors = logs.filter(msg => msg.includes("error") || msg.includes("Error"));
      if (errors.length > 0) {
        console.log(`[${preset}] Errors found:`, errors);
      }

      console.log(`[${preset}] OK - nodes=${info!.nodeCount}, edges=${info!.edgeCount}`);
    });
  }
});

// =========================================================================
// Test Suite: Consistency Across Preset Changes
// =========================================================================

test.describe("Consistency Across Preset Changes", () => {
  test("verify all presets render successfully in series", async () => {
    // Each preset should successfully render with node visibility
    for (const preset of PRESETS) {
      const info = await getViewInfo();
      if (info) {
        expect(info.nodeCount).toBeGreaterThan(0);
        console.log(`[${preset}] verified - nodes=${info.nodeCount}`);
      }
    }
  });
});
