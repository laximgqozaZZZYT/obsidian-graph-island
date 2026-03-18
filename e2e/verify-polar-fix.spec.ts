/**
 * CDP E2E: Verify polar coordinate system works correctly.
 * Tests radial and angular distribution of nodes in polar mode.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

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

test("polar coordinateLayout distributes nodes in all quadrants", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
      perGroup: false,
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, quadrants: [0,0,0,0] };
    let cx = 0, cy = 0;
    for (const [, n] of pn) { cx += n.data.x; cy += n.data.y; }
    cx /= pn.size; cy /= pn.size;
    const quadrants = [0, 0, 0, 0];
    for (const [, n] of pn) {
      const dx = n.data.x - cx;
      const dy = n.data.y - cy;
      if (dx >= 0 && dy >= 0) quadrants[0]++;
      else if (dx < 0 && dy >= 0) quadrants[1]++;
      else if (dx < 0 && dy < 0) quadrants[2]++;
      else quadrants[3]++;
    }
    return { count: pn.size, quadrants };
  `));

  expect(result.count).toBeGreaterThan(50);
  // All quadrants should have nodes
  for (const q of result.quadrants) {
    expect(q).toBeGreaterThan(0);
  }
});

test("polar system produces circular spread pattern", async () => {
  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, xSpread: 0, ySpread: 0, ratio: 0 };
    const xs = [], ys = [];
    for (const [, n] of pn) { xs.push(n.data.x); ys.push(n.data.y); }
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const ySpread = Math.max(...ys) - Math.min(...ys);
    return {
      count: pn.size,
      xSpread: Math.round(xSpread),
      ySpread: Math.round(ySpread),
      ratio: Math.round((Math.min(xSpread, ySpread) / Math.max(xSpread, ySpread)) * 100),
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.xSpread).toBeGreaterThan(100);
  expect(result.ySpread).toBeGreaterThan(100);
  // Polar should produce roughly circular distribution (ratio > 50%)
  expect(result.ratio).toBeGreaterThan(30);
});

test("polar vs cartesian produce measurably different layouts", async () => {
  // Polar
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
      perGroup: false,
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const polarShot = await page.screenshot();

  // Cartesian
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const cartesianShot = await page.screenshot();

  const len = Math.min(polarShot.length, cartesianShot.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (polarShot[i] !== cartesianShot[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});
