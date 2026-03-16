import { test, expect, chromium, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const CDP_URL = "http://localhost:9222";
const VIEW_TYPE = "graph-view";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  // Wait for Obsidian to be fully ready
  await new Promise(r => setTimeout(r, 8000));

  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    console.error("CDP connection failed:", e);
    throw e;
  }

  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  if (!page) {
    throw new Error("No index.html page found");
  }

  await page.bringToFront();

  // Initialize Obsidian app and plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (!app) {
      throw new Error("app not available");
    }

    // Ensure plugin is enabled
    const plugins = app.plugins.plugins;
    const hasPlugin = typeof plugins.get === "function"
      ? plugins.get("graph-island")
      : plugins["graph-island"];
    if (!hasPlugin) {
      await app.plugins.enablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 3000));
    }

    // Open the graph view
    const existing = app.workspace.getLeavesOfType("graph-view");
    if (existing.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
    }

    // Wait until view is available
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const leaves = app.workspace.getLeavesOfType("graph-view");
      if (leaves.length > 0 && leaves[0].view?.panel) {
        return "ready";
      }
      if (attempt === 5) {
        await app.commands.executeCommandById("graph-island:open-graph-view");
      }
    }
    return "ready (timeout)";
  });
});

test.afterAll(async () => {
  await browser?.close();
});

function loadPresetFile(presetName: string): Record<string, unknown> {
  const presetPath = join(__dirname, `../samples/${presetName}`);
  const content = readFileSync(presetPath, "utf-8");
  return JSON.parse(content);
}

async function takeScreenshot(page: Page, outDir: string, name: string) {
  await new Promise(r => setTimeout(r, 3000)); // Wait for render to complete
  const buf = await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: false });
  console.log(`Screenshot saved: ${join(outDir, `${name}.png`)}`);
}

test("Screenshot: Grid Layout (01-panorama-overview)", async () => {
  test.setTimeout(60000);

  // Ensure output directory exists
  const outDir = join(__dirname, "../debug-screenshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = loadPresetFile("01-panorama-overview.json");

  await page.evaluate((cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg.panel);
    view.panel.collapsedGroups = new Set(cfg.panel?.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);

  await page.waitForTimeout(8000);

  // Force road network rebuild
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view._rebuildRoadNetwork?.(true);
    }
  });

  await takeScreenshot(page, outDir, "01-panorama-grid");
  console.log("Grid layout screenshot captured");
});

test("Screenshot: Concentric Layout (02-dense-cluster)", async () => {
  test.setTimeout(60000);

  const outDir = join(__dirname, "../debug-screenshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = loadPresetFile("02-dense-cluster.json");

  await page.evaluate((cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg.panel);
    view.panel.collapsedGroups = new Set(cfg.panel?.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);

  await page.waitForTimeout(8000);

  // Force road network rebuild
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view._rebuildRoadNetwork?.(true);
    }
  });

  await takeScreenshot(page, outDir, "02-dense-concentric");
  console.log("Concentric layout screenshot captured");
});

test("Screenshot: Character Network (03-character-network)", async () => {
  test.setTimeout(60000);

  const outDir = join(__dirname, "../debug-screenshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = loadPresetFile("03-character-network.json");

  await page.evaluate((cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg.panel);
    view.panel.collapsedGroups = new Set(cfg.panel?.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);

  await page.waitForTimeout(8000);

  // Force road network rebuild
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view._rebuildRoadNetwork?.(true);
    }
  });

  await takeScreenshot(page, outDir, "03-character-network");
  console.log("Character network screenshot captured");
});

test("Screenshot: Mythology Pantheon (05-mythology-pantheon)", async () => {
  test.setTimeout(60000);

  const outDir = join(__dirname, "../debug-screenshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = loadPresetFile("05-mythology-pantheon.json");

  await page.evaluate((cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg.panel);
    view.panel.collapsedGroups = new Set(cfg.panel?.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);

  await page.waitForTimeout(8000);

  // Force road network rebuild
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view._rebuildRoadNetwork?.(true);
    }
  });

  await takeScreenshot(page, outDir, "05-mythology-pantheon");
  console.log("Mythology pantheon screenshot captured");
});

test("Screenshot: Minimalist (09-minimalist)", async () => {
  test.setTimeout(60000);

  const outDir = join(__dirname, "../debug-screenshots");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = loadPresetFile("09-minimalist.json");

  await page.evaluate((cfg: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    Object.assign(view.panel, cfg.panel);
    view.panel.collapsedGroups = new Set(cfg.panel?.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config);

  await page.waitForTimeout(8000);

  // Force road network rebuild
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view._rebuildRoadNetwork?.(true);
    }
  });

  await takeScreenshot(page, outDir, "09-minimalist");
  console.log("Minimalist screenshot captured");
});
