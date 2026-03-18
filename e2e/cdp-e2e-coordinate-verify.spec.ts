/**
 * CDP E2E: Verify coordinate engine produces correct grid positions.
 * Tests cartesian vs polar systems and different axis sources.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(180_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 2000));
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 4000));
    }
  });
});

function ev(code: string): string {
  return `(async () => {
    const app = window.app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find(l => l.view?.panel) || leaves[0];
    if (!leaf) throw new Error("no leaf");
    const view = leaf.view;
    if (!(view.panel.collapsedGroups instanceof Set)) {
      view.panel.collapsedGroups = new Set(
        Array.isArray(view.panel.collapsedGroups) ? view.panel.collapsedGroups : []
      );
    }
    ${code}
  })()`;
}

async function getNodePositions(): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return {};
    const coords = {};
    for (const [id, n] of pn) {
      coords[id] = { x: Math.round(n.data.x), y: Math.round(n.data.y) };
    }
    return coords;
  `));
}

test("grid arrangement produces grid-like spread in both axes", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const coords = await getNodePositions();
  const ids = Object.keys(coords);
  expect(ids.length).toBeGreaterThan(50);

  const xs = ids.map(id => coords[id].x);
  const ys = ids.map(id => coords[id].y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);

  // Grid should spread in both dimensions
  expect(xSpread).toBeGreaterThan(100);
  expect(ySpread).toBeGreaterThan(100);
});

test("cartesian coordinateLayout with metric:degree axis spreads by degree", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const coords = await getNodePositions();
  const ids = Object.keys(coords);
  expect(ids.length).toBeGreaterThan(50);

  const xs = ids.map(id => coords[id].x);
  const distinctX = new Set(xs.map(x => Math.round(x / 10))).size;
  // Degree-based axis should produce multiple distinct X levels
  expect(distinctX).toBeGreaterThan(3);
});

test("polar system produces radial distribution different from cartesian", async () => {
  // First: cartesian index-based
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const cartesian = await getNodePositions();

  // Then: polar
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
      perGroup: true,
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const polar = await getNodePositions();

  const commonIds = Object.keys(cartesian).filter(id => polar[id]);
  expect(commonIds.length).toBeGreaterThan(10);

  // Calculate total displacement between the two layouts
  let totalDist = 0;
  for (const id of commonIds.slice(0, 50)) {
    const dx = cartesian[id].x - polar[id].x;
    const dy = cartesian[id].y - polar[id].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }
  const avgDist = totalDist / Math.min(commonIds.length, 50);
  expect(avgDist).toBeGreaterThan(10);
});

test("field:folder categorical axis produces distinct columns per folder", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "categorical" } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const coords = await getNodePositions();
  const ids = Object.keys(coords);
  expect(ids.length).toBeGreaterThan(10);

  const xs = ids.map(id => coords[id].x);
  const distinctX = new Set(xs).size;
  // Categorical axis should produce a limited number of distinct X positions
  expect(distinctX).toBeGreaterThan(1);
  expect(distinctX).toBeLessThan(ids.length);
});
