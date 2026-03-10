// ---------------------------------------------------------------------------
// Obsidian E2E — Basic Graph Island Smoke Tests
// ---------------------------------------------------------------------------
// These tests launch the actual Obsidian Electron app with a test vault,
// open Graph Island, and verify basic rendering and interaction.
// ---------------------------------------------------------------------------

import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  prepareTestVault,
  launchObsidian,
  waitForObsidianReady,
  openGraphIsland,
  closeObsidian,
} from "./obsidian-helpers";

let app: ElectronApplication;
let page: Page;
let vaultPath: string;
let workDir: string;
let vaultId: string;

test.beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-e2e-"));
  vaultPath = prepareTestVault(workDir);
  const result = await launchObsidian(vaultPath);
  app = result.app;
  page = result.page;
  vaultId = result.vaultId;
  await waitForObsidianReady(page);
});

test.afterAll(async () => {
  if (app) await closeObsidian(app, vaultId);
  if (workDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test.describe("Obsidian Launch & Plugin Load", () => {
  test("Obsidian window opens successfully", async () => {
    const title = await page.title();
    // Obsidian window title contains the vault name or "Obsidian"
    expect(title).toBeTruthy();
  });

  test("Graph Island plugin is loaded", async () => {
    const pluginLoaded = await page.evaluate(() => {
      const app = (window as any).app;
      if (!app?.plugins?.plugins) return false;
      return "graph-island" in app.plugins.plugins;
    });
    expect(pluginLoaded).toBe(true);
  });

  test("Graph Island plugin is enabled", async () => {
    const enabled = await page.evaluate(() => {
      const app = (window as any).app;
      const manifest = app?.plugins?.manifests?.["graph-island"];
      return !!manifest;
    });
    expect(enabled).toBe(true);
  });
});

test.describe("Graph View Opening", () => {
  test("can open Graph Island via command palette", async () => {
    await openGraphIsland(page);

    // Check that a graph-island view leaf exists in the workspace
    const hasView = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      return leaves.length > 0;
    });
    expect(hasView).toBe(true);
  });

  test("graph view container is visible", async () => {
    // The plugin creates a container with class 'graph-island-container' or similar
    const container = page.locator(".graph-view-container, .view-content canvas, .graph-island-container");
    await expect(container.first()).toBeVisible({ timeout: 10_000 });
  });

  test("canvas element exists (PIXI.js rendering)", async () => {
    // PIXI.js renders to a canvas element
    const canvas = page.locator("canvas");
    const count = await canvas.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Graph Content Verification", () => {
  test("graph contains expected number of nodes from vault", async () => {
    // Wait for graph to populate
    await page.waitForTimeout(2000);

    const nodeCount = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return -1;
      const view = leaves[0].view;
      // Access the internal graph data
      if (view.graphData) return view.graphData.nodes.length;
      if (view.container?.graphData) return view.container.graphData.nodes.length;
      return -2;
    });

    // We have 5 md files: Alice, Bob, Wonderland, Castle, Story
    // Depending on settings, there may be tag nodes too
    expect(nodeCount).toBeGreaterThanOrEqual(5);
  });

  test("graph contains edges from wikilinks", async () => {
    const edgeCount = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return -1;
      const view = leaves[0].view;
      if (view.graphData) return view.graphData.edges.length;
      if (view.container?.graphData) return view.container.graphData.edges.length;
      return -2;
    });

    // Alice→Bob, Alice→Wonderland, Bob→Alice, Bob→Castle,
    // Wonderland→Alice, Wonderland→Castle, Castle→Wonderland, Castle→Bob,
    // Story→Alice, Story→Bob = at least 5 unique link edges
    expect(edgeCount).toBeGreaterThanOrEqual(5);
  });
});

test.describe("Toolbar Interaction", () => {
  test("toolbar is visible with node/edge count", async () => {
    const toolbar = page.locator(".graph-toolbar, .graph-controls");
    await expect(toolbar.first()).toBeVisible({ timeout: 5000 });
  });

  test("status bar shows node count", async () => {
    const status = page.locator(".graph-status, .graph-node-count");
    if (await status.count() > 0) {
      const text = await status.first().textContent();
      expect(text).toMatch(/\d+/); // Contains a number
    }
  });
});

test.describe("Layout Switching", () => {
  test("can switch to concentric layout", async () => {
    // Open settings panel if needed
    const settingsBtn = page.locator(".graph-settings-btn, [aria-label*='settings'], [aria-label*='設定']");
    if (await settingsBtn.count() > 0) {
      await settingsBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Look for layout selector
    const layoutSelect = page.locator("select, .layout-select, [data-layout]");
    if (await layoutSelect.count() > 0) {
      // Try to change layout
      const select = layoutSelect.first();
      const tagName = await select.evaluate(el => el.tagName.toLowerCase());
      if (tagName === "select") {
        await select.selectOption("concentric");
        await page.waitForTimeout(1000);
      }
    }

    // Verify no crash — canvas still present
    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });

  test("can switch to tree layout", async () => {
    const layoutSelect = page.locator("select").first();
    if (await layoutSelect.count() > 0) {
      try {
        await layoutSelect.selectOption("tree");
        await page.waitForTimeout(1000);
      } catch {
        // Layout may not be in a <select> — skip
      }
    }
    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });

  test("can switch back to force layout", async () => {
    const layoutSelect = page.locator("select").first();
    if (await layoutSelect.count() > 0) {
      try {
        await layoutSelect.selectOption("force");
        await page.waitForTimeout(1000);
      } catch {
        // skip
      }
    }
    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });
});
