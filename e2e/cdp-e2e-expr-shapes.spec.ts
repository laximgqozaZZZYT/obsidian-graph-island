/**
 * E2E: Verify grid and triangle fills expressed purely with math expressions
 * (no hardcoded layout functions — using the coordinate engine with expression transforms).
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

  // Reload plugin
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
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  // Open fresh graph view
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test.afterAll(async () => {});

/** Helper: apply a custom coordinateLayout and collect positions */
async function applyLayout(
  page: Page,
  coordinateLayout: any,
  label: string,
): Promise<{ count: number; positions: { id: string; x: number; y: number }[] }> {
  const result = await page.evaluate(async (args: { layout: any; label: string }) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { error: "no graph view", count: 0, positions: [] };

    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return { error: "no panel", count: 0, positions: [] };

    // Use "custom" arrangement to force coordinate engine path
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = args.layout;

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
  }, { layout: coordinateLayout, label });

  return result as { count: number; positions: { id: string; x: number; y: number }[] };
}

// =========================================================================
// Grid via expressions: x = i % ceil(sqrt(n)), y = floor(i / ceil(sqrt(n)))
// =========================================================================

test("01 — grid fill via math expressions", async () => {
  test.setTimeout(30_000);

  const layout = {
    system: "cartesian",
    axis1: {
      source: { kind: "index" },
      transform: { kind: "expression", expr: "i % ceil(sqrt(n))", scale: 1 },
    },
    axis2: {
      source: { kind: "index" },
      transform: { kind: "expression", expr: "floor(i / ceil(sqrt(n)))", scale: 1 },
    },
    perGroup: true,
  };

  const result = await applyLayout(page, layout, "grid-expr");
  expect(result.count).toBeGreaterThan(0);
  console.log(`grid-expr: ${result.count} nodes, ${result.positions.length} with positions`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 6))}`);

    // Grid: should have multiple rows AND columns
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    // X*Y product ≈ total nodes (grid property)
    const product = xs.size * ys.size;
    console.log(`  X×Y product: ${product}, count: ${result.positions.length}`);
    expect(product).toBeGreaterThanOrEqual(result.positions.length * 0.5);
  }

  await page.screenshot({ path: "e2e/screenshot-expr-01-grid.png", fullPage: false });
});

// =========================================================================
// Triangle via expressions
// =========================================================================

test("02 — triangle fill via math expressions", async () => {
  test.setTimeout(30_000);

  const rowExpr = "floor((-1+sqrt(1+8*i))/2)";
  const xExpr = `i - ${rowExpr}*(${rowExpr}+1)/2 - ${rowExpr}/2`;
  const yExpr = rowExpr;

  console.log(`triangle x expr: ${xExpr}`);
  console.log(`triangle y expr: ${yExpr}`);

  const layout = {
    system: "cartesian",
    axis1: {
      source: { kind: "index" },
      transform: { kind: "expression", expr: xExpr, scale: 1 },
    },
    axis2: {
      source: { kind: "index" },
      transform: { kind: "expression", expr: yExpr, scale: 1 },
    },
    perGroup: true,
  };

  const result = await applyLayout(page, layout, "triangle-expr");
  expect(result.count).toBeGreaterThan(0);
  console.log(`triangle-expr: ${result.count} nodes, ${result.positions.length} with positions`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 6))}`);

    // Triangle: multiple rows, with increasing width
    expect(ys.size).toBeGreaterThan(1);
    // Should NOT be a diagonal (xs.size should be less than positions.length)
    expect(xs.size).toBeLessThan(result.positions.length);
  }

  await page.screenshot({ path: "e2e/screenshot-expr-02-triangle.png", fullPage: false });
});

// =========================================================================
// Hardcoded grid for comparison
// =========================================================================

test("03 — hardcoded grid for comparison", async () => {
  test.setTimeout(30_000);

  const result = await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { count: 0, positions: [] };

    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return { count: 0, positions: [] };

    panel.clusterArrangement = "grid";
    panel.coordinateLayout = null;

    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.restartSimulation === "function") view.restartSimulation(0.5);
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const wrap = view.canvasWrap;
    if (wrap && typeof view.autoFitView === "function") {
      view.autoFitView(wrap.clientWidth, wrap.clientHeight);
    }
    if (typeof view.markDirty === "function") view.markDirty();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));

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
    return { count: positions.length, positions };
  });

  console.log(`hardcoded grid: ${result.count} nodes`);
  await page.screenshot({ path: "e2e/screenshot-expr-03-hardcoded-grid.png", fullPage: false });
});
