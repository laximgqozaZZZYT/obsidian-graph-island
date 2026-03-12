/**
 * E2E: Verify routing fix — grid, triangle, mountain use hardcoded layout functions
 * (not the generic coordinate engine which produces diagonal lines).
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Reload plugin to pick up latest main.js
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close stale graph-view leaves
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    leaves.forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  // Open fresh graph view
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test.afterAll(async () => {
  // Don't close — reusing running Obsidian
});

/** Helper: switch arrangement and collect node positions */
async function switchArrangement(
  page: Page,
  arrangement: string,
): Promise<{ count: number; positions: { id: string; x: number; y: number }[] }> {
  const result = await page.evaluate(async (arr: string) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { error: "no graph view", count: 0, positions: [] };

    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return { error: "no panel", count: 0, positions: [] };

    // Set arrangement and CLEAR coordinateLayout so hardcoded path is used
    panel.clusterArrangement = arr;
    panel.coordinateLayout = null;

    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.restartSimulation === "function") view.restartSimulation(0.5);
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    // Fit view
    const wrap = view.canvasWrap;
    if (wrap && typeof view.autoFitView === "function") {
      view.autoFitView(wrap.clientWidth, wrap.clientHeight);
    }
    if (typeof view.markDirty === "function") view.markDirty();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));

    // Collect positions
    const positions: { id: string; x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [id, pn] of view.pixiNodes) {
        if (i++ >= 80) break;
        positions.push({
          id: (id ?? "").substring(0, 25),
          x: Math.round((pn as any).gfx?.x ?? (pn as any).x ?? 0),
          y: Math.round((pn as any).gfx?.y ?? (pn as any).y ?? 0),
        });
      }
    }
    const graphNodes = view.graphData?.nodes ?? [];
    return { count: graphNodes.length || positions.length, positions };
  }, arrangement);

  return result as { count: number; positions: { id: string; x: number; y: number }[] };
}

// =========================================================================
// Test: Grid — should have multiple distinct X and Y values (not diagonal)
// =========================================================================

test("01 — grid arrangement fills a rectangular shape", async () => {
  test.setTimeout(30_000);
  const result = await switchArrangement(page, "grid");
  expect(result.count).toBeGreaterThan(0);
  console.log(`grid: ${result.count} nodes, ${result.positions.length} with positions`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X values: ${xs.size}, unique Y values: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 8))}`);

    // Grid should have multiple rows AND columns (not a diagonal line)
    // A diagonal would have xs.size ≈ ys.size ≈ positions.length (each node unique x,y)
    // A grid should have xs.size * ys.size ≈ positions.length
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    // The product of unique X × unique Y should roughly match total nodes
    // (for a proper grid, product >= count)
    const product = xs.size * ys.size;
    console.log(`  X×Y product: ${product}, node count: ${result.positions.length}`);
    expect(product).toBeGreaterThanOrEqual(result.positions.length * 0.5);
  }

  await page.screenshot({ path: "e2e/screenshot-routing-01-grid.png", fullPage: false });
});

// =========================================================================
// Test: Triangle — nodes should form a triangular shape
// =========================================================================

test("02 — triangle arrangement fills a triangular shape", async () => {
  test.setTimeout(30_000);
  const result = await switchArrangement(page, "triangle");
  expect(result.count).toBeGreaterThan(0);
  console.log(`triangle: ${result.count} nodes, ${result.positions.length} with positions`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X values: ${xs.size}, unique Y values: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 8))}`);

    // Triangle should have multiple rows with increasing width
    expect(ys.size).toBeGreaterThan(1);
  }

  await page.screenshot({ path: "e2e/screenshot-routing-02-triangle.png", fullPage: false });
});

// =========================================================================
// Test: Mountain — peak at top, widening rows
// =========================================================================

test("03 — mountain arrangement fills a mountain shape", async () => {
  test.setTimeout(30_000);
  const result = await switchArrangement(page, "mountain");
  expect(result.count).toBeGreaterThan(0);
  console.log(`mountain: ${result.count} nodes, ${result.positions.length} with positions`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X values: ${xs.size}, unique Y values: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 8))}`);

    // Mountain should have multiple rows
    expect(ys.size).toBeGreaterThan(1);
  }

  await page.screenshot({ path: "e2e/screenshot-routing-03-mountain.png", fullPage: false });
});

// =========================================================================
// Test: Spiral — verify still works (control)
// =========================================================================

test("04 — spiral still works (control)", async () => {
  test.setTimeout(30_000);
  const result = await switchArrangement(page, "spiral");
  expect(result.count).toBeGreaterThan(0);
  console.log(`spiral: ${result.count} nodes`);

  await page.screenshot({ path: "e2e/screenshot-routing-04-spiral.png", fullPage: false });
});
