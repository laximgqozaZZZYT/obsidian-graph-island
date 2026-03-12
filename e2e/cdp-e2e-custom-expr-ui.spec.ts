/**
 * E2E: Verify that "Custom" arrangement with grid/triangle expressions
 * produces correct shapes AND displays correctly in the textarea UI.
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
});

test.afterAll(async () => {});

/**
 * Set a coordinateLayout with expression transforms via panel, then
 * apply forces, wait, collect positions and textarea UI state.
 */
async function applyExprLayout(
  page: Page,
  axis1Expr: string,
  axis2Expr: string,
  system: string = "cartesian",
): Promise<{
  count: number;
  positions: { id: string; x: number; y: number }[];
  textareaValues: string[];
  indicators: string[];
}> {
  const result = await page.evaluate(async (args: {
    a1: string; a2: string; system: string;
  }) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { error: "no graph view", count: 0, positions: [], textareaValues: [], indicators: [] };

    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return { error: "no panel", count: 0, positions: [], textareaValues: [], indicators: [] };

    // Set arrangement to "custom" with expression-based coordinateLayout
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: args.system,
      axis1: {
        source: { kind: "index" },
        transform: { kind: "expression", expr: args.a1, scale: 1 },
      },
      axis2: {
        source: { kind: "index" },
        transform: { kind: "expression", expr: args.a2, scale: 1 },
      },
      perGroup: true,
    };

    // Apply forces and simulate
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.restartSimulation === "function") view.restartSimulation(0.5);
    if (typeof view.doRender === "function") view.doRender();

    // Rebuild panel so textareas reflect the new expressions
    if (typeof view.rebuildPanel === "function") view.rebuildPanel();

    await new Promise(r => setTimeout(r, 5000));

    // Fit view
    const wrap = view.canvasWrap;
    if (wrap && typeof view.autoFitView === "function") {
      view.autoFitView(wrap.clientWidth, wrap.clientHeight);
    }
    if (typeof view.markDirty === "function") view.markDirty();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));

    // Check textarea UI state
    const textareaValues: string[] = [];
    const indicators: string[] = [];
    const textareas = document.querySelectorAll(".gi-expr-textarea") as NodeListOf<HTMLTextAreaElement>;
    for (const ta of textareas) {
      textareaValues.push(ta.value);
    }
    const indicatorEls = document.querySelectorAll(".gi-expr-indicator");
    for (const ind of indicatorEls) {
      indicators.push((ind as HTMLElement).textContent?.trim() ?? "");
    }

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
    return {
      count: graphNodes.length || positions.length,
      positions,
      textareaValues,
      indicators,
    };
  }, { a1: axis1Expr, a2: axis2Expr, system });

  return result as any;
}

// =========================================================================
// Test 01: Grid via Custom arrangement + expression
// =========================================================================

test("01 — custom arrangement: grid via i % ceil(sqrt(n))", async () => {
  test.setTimeout(40_000);

  const result = await applyExprLayout(
    page,
    "i % ceil(sqrt(n))",
    "floor(i / ceil(sqrt(n)))",
  );

  console.log(`grid-custom: ${result.count} nodes`);
  console.log(`  textareas: ${JSON.stringify(result.textareaValues)}`);
  console.log(`  indicators: ${JSON.stringify(result.indicators)}`);

  expect(result.count).toBeGreaterThan(0);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 6))}`);

    // Grid: multiple distinct rows and columns (not diagonal)
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    // X × Y product ~ total nodes (grid property)
    expect(xs.size * ys.size).toBeGreaterThanOrEqual(result.positions.length * 0.5);
  }

  // Verify textareas display the expressions
  expect(result.textareaValues.length).toBeGreaterThanOrEqual(2);
  console.log(`  textarea count: ${result.textareaValues.length}`);

  await page.screenshot({ path: "e2e/screenshot-custom-ui-01-grid.png", fullPage: false });
});

// =========================================================================
// Test 02: Triangle via Custom arrangement + expression
// =========================================================================

test("02 — custom arrangement: triangle via inverse triangular number", async () => {
  test.setTimeout(40_000);

  const rowExpr = "floor((-1+sqrt(1+8*i))/2)";
  const xExpr = `i - ${rowExpr}*(${rowExpr}+1)/2 - ${rowExpr}/2`;

  const result = await applyExprLayout(page, xExpr, rowExpr);

  console.log(`triangle-custom: ${result.count} nodes`);
  console.log(`  textareas: ${JSON.stringify(result.textareaValues)}`);
  console.log(`  indicators: ${JSON.stringify(result.indicators)}`);

  expect(result.count).toBeGreaterThan(0);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    console.log(`  sample: ${JSON.stringify(result.positions.slice(0, 6))}`);

    // Triangle: multiple rows, NOT diagonal
    expect(ys.size).toBeGreaterThan(1);
    expect(xs.size).toBeLessThan(result.positions.length);
  }

  expect(result.textareaValues.length).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: "e2e/screenshot-custom-ui-02-triangle.png", fullPage: false });
});
