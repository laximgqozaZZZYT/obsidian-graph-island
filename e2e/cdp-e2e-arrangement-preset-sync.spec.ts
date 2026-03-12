/**
 * E2E: Verify that selecting arrangement patterns pre-fills X/Y textareas
 * with correct expression formulas and renders the expected shapes.
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
 * Set arrangement via panel, trigger rebuild, wait, and collect textarea + positions.
 */
async function selectArrangement(page: Page, arrangement: string): Promise<{
  textareas: string[];
  positions: { x: number; y: number }[];
}> {
  return await page.evaluate(async (arr: string) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { textareas: [], positions: [] };
    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return { textareas: [], positions: [] };

    // Simulate dropdown selection: set arrangement and coordinateLayout = null
    // The panel builder falls back to ARRANGEMENT_PRESETS[arrangement] for UI display.
    // The LayoutController uses resolveCoordinateLayout() which also falls back.
    panel.clusterArrangement = arr;
    panel.coordinateLayout = null;
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.rebuildPanel === "function") view.rebuildPanel();
    if (typeof view.restartSimulation === "function") view.restartSimulation(0.5);
    await new Promise(r => setTimeout(r, 3000));

    // Fit view
    const wrap = view.canvasWrap;
    if (wrap && typeof view.autoFitView === "function") {
      view.autoFitView(wrap.clientWidth, wrap.clientHeight);
    }
    if (typeof view.markDirty === "function") view.markDirty();
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));

    // Read textarea values
    const textareas: string[] = [];
    document.querySelectorAll(".gi-expr-textarea").forEach(ta => {
      textareas.push((ta as HTMLTextAreaElement).value);
    });

    // Read positions
    const positions: { x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) {
        if (i++ >= 80) break;
        positions.push({
          x: Math.round((pn as any).gfx?.x ?? (pn as any).x ?? 0),
          y: Math.round((pn as any).gfx?.y ?? (pn as any).y ?? 0),
        });
      }
    }

    return { textareas, positions };
  }, arrangement);
}

// =========================================================================
// Test 01: Grid pre-fills X/Y with grid expressions and renders grid shape
// =========================================================================

test("01 — grid arrangement shows grid expressions in X/Y", async () => {
  test.setTimeout(40_000);

  const result = await selectArrangement(page, "grid");

  console.log(`Grid: textareas=${JSON.stringify(result.textareas)}`);
  expect(result.textareas.length).toBeGreaterThanOrEqual(2);
  expect(result.textareas[0]).toContain("ceil(sqrt(n))");
  expect(result.textareas[1]).toContain("floor");
  expect(result.textareas[1]).toContain("ceil(sqrt(n))");

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}, total: ${result.positions.length}`);
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  }

  await page.screenshot({ path: "e2e/screenshot-preset-sync-01-grid.png", fullPage: false });
});

// =========================================================================
// Test 02: Triangle pre-fills X/Y with triangle expressions
// =========================================================================

test("02 — triangle arrangement shows triangle expressions in X/Y", async () => {
  test.setTimeout(40_000);

  const result = await selectArrangement(page, "triangle");

  console.log(`Triangle: textareas=${JSON.stringify(result.textareas)}`);
  expect(result.textareas.length).toBeGreaterThanOrEqual(2);
  expect(result.textareas[1]).toContain("sqrt(1+8*i)");

  if (result.positions.length >= 4) {
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique Y: ${ys.size}`);
    expect(ys.size).toBeGreaterThan(1);
  }

  await page.screenshot({ path: "e2e/screenshot-preset-sync-02-triangle.png", fullPage: false });
});

// =========================================================================
// Test 03: Spiral pre-fills polar expressions (sqrt(t), golden angle)
// =========================================================================

test("03 — spiral arrangement shows polar expressions in r/θ", async () => {
  test.setTimeout(40_000);

  const result = await selectArrangement(page, "spiral");

  console.log(`Spiral: textareas=${JSON.stringify(result.textareas)}`);
  expect(result.textareas.length).toBeGreaterThanOrEqual(2);
  expect(result.textareas[0]).toContain("sqrt(t)");
  expect(result.textareas[1]).toContain("137.508");

  await page.screenshot({ path: "e2e/screenshot-preset-sync-03-spiral.png", fullPage: false });
});
