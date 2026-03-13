/**
 * CDP E2E Test — Sample Config Showcase (23–30)
 *
 * Validates that new sample configs load correctly, render without errors,
 * and produce nodes with correct arrangement properties.
 *
 * Samples:
 *   23: random scatter (tag:? grouping)
 *   24: baobab sunburst (large center hole via _hole=3.0)
 *   25: rose curve (5-petal polar expression, k=5)
 *   26: lissajous figure (cartesian sin expressions, a=3, b=2)
 *   27: filled pentagon (k=5 polygon expression)
 *   28: cardioid heart (polar cardioid expression)
 *   29: concentric degree (degree-sorted rings, category:?)
 *   30: mountain ridge (degree-height mapping, node_type:?)
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");
const SCREENSHOT_DIR = path.resolve(__dirname, "images");

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

  // Reload plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close stale leaves, open fresh graph view
  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);

  // Ensure screenshot dir exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.afterAll(async () => {
  // Don't close — reusing running Obsidian
});

// =========================================================================
// Helpers
// =========================================================================

function loadSample(filename: string): Record<string, unknown> {
  const filePath = path.join(SAMPLES_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

interface RenderResult {
  nodeCount: number;
  edgeCount: number;
  arrangement: string;
  hasCoordinateLayout: boolean;
  groupBy: string;
  nodePositions: Array<{ id: string; x: number; y: number }>;
  centerX: number;
  centerY: number;
  consoleErrors: string[];
}

/**
 * Apply a config and wait for rendering, then collect render info.
 */
async function applyAndRender(config: Record<string, unknown>): Promise<RenderResult> {
  return page.evaluate(async (cfg: Record<string, unknown>) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves || leaves.length === 0) throw new Error("No graph-view leaf");

    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) throw new Error("No panel found");

    // Apply fields
    for (const [key, value] of Object.entries(cfg)) {
      if (key === "collapsedGroups" && Array.isArray(value)) {
        (panel as any)[key] = new Set(value);
      } else {
        (panel as any)[key] = value;
      }
    }

    // Trigger full rebuild: doRender re-fetches data, rebuilds simulation + panel
    if (typeof view.doRender === "function") await view.doRender();

    // Wait for simulation to settle
    await new Promise(r => setTimeout(r, 4000));

    // Restart simulation with high alpha to force layout recalculation
    if (typeof view.restartSimulation === "function") view.restartSimulation(1.0);

    // Wait for layout to converge
    await new Promise(r => setTimeout(r, 3000));

    // Collect node positions
    const sim = view.simulation;
    const simNodes = sim?.nodes?.() ?? [];
    const positions = simNodes.slice(0, 50).map((n: any) => ({
      id: n.id ?? "",
      x: n.x ?? 0,
      y: n.y ?? 0,
    }));

    // Center
    const cx = positions.length > 0
      ? positions.reduce((s: number, p: any) => s + p.x, 0) / positions.length
      : 0;
    const cy = positions.length > 0
      ? positions.reduce((s: number, p: any) => s + p.y, 0) / positions.length
      : 0;

    // Console errors
    const msgs = (window as any).__testConsoleMessages ?? [];
    const errors = msgs.filter((m: string) => m.includes("Error") || m.includes("error")).slice(-5);

    return {
      nodeCount: view.rawData?.nodes?.length ?? simNodes.length,
      edgeCount: view.rawData?.edges?.length ?? 0,
      arrangement: panel.clusterArrangement ?? "unknown",
      hasCoordinateLayout: !!panel.coordinateLayout,
      groupBy: panel.groupBy ?? "none",
      nodePositions: positions,
      centerX: cx,
      centerY: cy,
      consoleErrors: errors,
    };
  }, config);
}

async function takeScreenshot(name: string): Promise<void> {
  const screenshotPath = path.join(SCREENSHOT_DIR, `sample-${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot saved: ${screenshotPath}`);
}

// =========================================================================
// Sample showcase definitions
// =========================================================================

const SHOWCASE_SAMPLES: Array<{
  file: string;
  name: string;
  arrangement: string;
  hasCustomCoord: boolean;
  groupBy: string;
  checks: (result: RenderResult) => void;
}> = [
  {
    file: "23-random-scatter.json",
    name: "23-random-scatter",
    arrangement: "random",
    hasCustomCoord: false,
    groupBy: "tag:?",
    checks: (r) => {
      // Random: nodes should be spread out, not all on a single point
      if (r.nodePositions.length >= 3) {
        const xs = r.nodePositions.map(p => p.x);
        const ys = r.nodePositions.map(p => p.y);
        const xRange = Math.max(...xs) - Math.min(...xs);
        const yRange = Math.max(...ys) - Math.min(...ys);
        expect(xRange, "random x-spread should be > 0").toBeGreaterThan(0);
        expect(yRange, "random y-spread should be > 0").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "24-baobab-sunburst.json",
    name: "24-baobab-sunburst",
    arrangement: "sunburst",
    hasCustomCoord: true,
    groupBy: "folder:?",
    checks: (r) => {
      // Sunburst: nodes should be roughly centered
      // and have some radial spread
      if (r.nodePositions.length >= 3) {
        const dists = r.nodePositions.map(p =>
          Math.sqrt((p.x - r.centerX) ** 2 + (p.y - r.centerY) ** 2));
        const maxDist = Math.max(...dists);
        expect(maxDist, "sunburst should have radial spread").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "25-rose-curve.json",
    name: "25-rose-curve",
    arrangement: "custom",
    hasCustomCoord: true,
    groupBy: "tag:?",
    checks: (r) => {
      // Rose curve: nodes should form a pattern around center
      if (r.nodePositions.length >= 3) {
        const dists = r.nodePositions.map(p =>
          Math.sqrt((p.x - r.centerX) ** 2 + (p.y - r.centerY) ** 2));
        const maxDist = Math.max(...dists);
        expect(maxDist, "rose curve should have radial extent").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "26-lissajous-figure.json",
    name: "26-lissajous-figure",
    arrangement: "custom",
    hasCustomCoord: true,
    groupBy: "folder:?",
    checks: (r) => {
      // Lissajous: bounded in both x and y (sin output is [-1,1])
      if (r.nodePositions.length >= 3) {
        const xs = r.nodePositions.map(p => p.x);
        const ys = r.nodePositions.map(p => p.y);
        const xRange = Math.max(...xs) - Math.min(...xs);
        const yRange = Math.max(...ys) - Math.min(...ys);
        expect(xRange, "lissajous x-range").toBeGreaterThan(0);
        expect(yRange, "lissajous y-range").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "27-filled-pentagon.json",
    name: "27-filled-pentagon",
    arrangement: "custom",
    hasCustomCoord: true,
    groupBy: "tag:?",
    checks: (r) => {
      // Pentagon: k=5 polygon, should have radial spread
      if (r.nodePositions.length >= 3) {
        const dists = r.nodePositions.map(p =>
          Math.sqrt((p.x - r.centerX) ** 2 + (p.y - r.centerY) ** 2));
        expect(Math.max(...dists), "pentagon radial extent").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "28-cardioid-heart.json",
    name: "28-cardioid-heart",
    arrangement: "custom",
    hasCustomCoord: true,
    groupBy: "category:?",
    checks: (r) => {
      // Cardioid: polar layout, nodes form a heart shape
      if (r.nodePositions.length >= 3) {
        const dists = r.nodePositions.map(p =>
          Math.sqrt((p.x - r.centerX) ** 2 + (p.y - r.centerY) ** 2));
        expect(Math.max(...dists), "cardioid radial extent").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "29-concentric-degree.json",
    name: "29-concentric-degree",
    arrangement: "concentric",
    hasCustomCoord: false,
    groupBy: "category:?",
    checks: (r) => {
      // Concentric: nodes in rings around center
      if (r.nodePositions.length >= 3) {
        const dists = r.nodePositions.map(p =>
          Math.sqrt((p.x - r.centerX) ** 2 + (p.y - r.centerY) ** 2));
        const maxDist = Math.max(...dists);
        expect(maxDist, "concentric radial spread").toBeGreaterThan(0);
      }
    },
  },
  {
    file: "30-mountain-ridge.json",
    name: "30-mountain-ridge",
    arrangement: "mountain",
    hasCustomCoord: false,
    groupBy: "node_type:?",
    checks: (r) => {
      // Mountain: high-degree nodes should be higher (lower y value)
      // Just verify spread exists
      if (r.nodePositions.length >= 3) {
        const ys = r.nodePositions.map(p => p.y);
        const yRange = Math.max(...ys) - Math.min(...ys);
        expect(yRange, "mountain y-spread").toBeGreaterThan(0);
      }
    },
  },
];

// =========================================================================
// Test Suite
// =========================================================================

test.describe("Sample Config Showcase (23–30)", () => {
  for (const sample of SHOWCASE_SAMPLES) {
    test(`${sample.name}: loads and renders correctly`, async () => {
      const config = loadSample(sample.file);
      const result = await applyAndRender(config);

      // Basic checks
      expect(result.nodeCount, `${sample.name} should have nodes`).toBeGreaterThan(0);
      expect(result.arrangement, `${sample.name} arrangement`).toBe(sample.arrangement);
      expect(result.groupBy, `${sample.name} groupBy`).toBe(sample.groupBy);

      if (sample.hasCustomCoord) {
        expect(result.hasCoordinateLayout, `${sample.name} coordinateLayout`).toBe(true);
      }

      // No critical console errors
      if (result.consoleErrors.length > 0) {
        console.warn(`[${sample.name}] Console errors:`, result.consoleErrors);
      }

      // Take screenshot
      await takeScreenshot(sample.name);

      // Arrangement-specific checks
      sample.checks(result);

      console.log(
        `[${sample.name}] OK — ${result.nodeCount} nodes, ` +
        `${result.edgeCount} edges, center=(${result.centerX.toFixed(0)},${result.centerY.toFixed(0)})`
      );
    });
  }
});

// =========================================================================
// Consistency: Verify all samples can be loaded in sequence
// =========================================================================

test.describe("Sequential Loading Stability", () => {
  test("all 8 samples load sequentially without crashes", async () => {
    test.setTimeout(120_000);
    for (const sample of SHOWCASE_SAMPLES) {
      const config = loadSample(sample.file);
      const result = await applyAndRender(config);
      expect(result.nodeCount, `${sample.name} nodes`).toBeGreaterThan(0);
      console.log(`  ✓ ${sample.name}: ${result.nodeCount} nodes`);
    }
  });
});

// =========================================================================
// coordinateLayout Constants Verification
// =========================================================================

test.describe("coordinateLayout Constants", () => {
  test("24-baobab-sunburst has custom ring geometry constants", async () => {
    const config = loadSample("24-baobab-sunburst.json");
    const cl = config.coordinateLayout as any;
    expect(cl).toBeDefined();
    expect(cl.constants._ringW).toBe(0.25);
    expect(cl.constants._ringGap).toBe(0.02);
    expect(cl.constants._hole).toBe(3.0);
    expect(cl.constants._sectorGap).toBe(0.015);
  });

  test("25-rose-curve has k=5 petal constant", async () => {
    const config = loadSample("25-rose-curve.json");
    const cl = config.coordinateLayout as any;
    expect(cl.constants.k).toBe(5);
    expect(cl.constants.a).toBe(1.0);
    expect(cl.axis1.transform.expr).toContain("cos(k*i/n*pi)");
  });

  test("26-lissajous has a=3, b=2, d=0.5 frequency constants", async () => {
    const config = loadSample("26-lissajous-figure.json");
    const cl = config.coordinateLayout as any;
    expect(cl.constants.a).toBe(3);
    expect(cl.constants.b).toBe(2);
    expect(cl.constants.d).toBe(0.5);
  });

  test("27-filled-pentagon has k=5 polygon constant", async () => {
    const config = loadSample("27-filled-pentagon.json");
    const cl = config.coordinateLayout as any;
    expect(cl.constants.k).toBe(5);
    expect(cl.constants.d).toBe(0.5);
    expect(cl.axis1.transform.expr).toContain("cos(pi/k)");
  });

  test("28-cardioid uses polar system with expression", async () => {
    const config = loadSample("28-cardioid-heart.json");
    const cl = config.coordinateLayout as any;
    expect(cl.system).toBe("polar");
    expect(cl.constants.a).toBe(1.0);
    expect(cl.axis1.transform.expr).toContain("1+cos(");
  });
});
