/**
 * CDP E2E: Verify concentric layout with coordinate engine polar system.
 * Tests even-divide angular distribution and ring count.
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

test("concentric with polar coordinateLayout produces radial distribution", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "floor(i / 8) + 1", scale: 1 } },
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
    if (!pn || pn.size === 0) return { count: 0 };
    let cx = 0, cy = 0;
    for (const [, n] of pn) { cx += n.data.x; cy += n.data.y; }
    cx /= pn.size; cy /= pn.size;
    const dists = [];
    for (const [, n] of pn) {
      dists.push(Math.round(Math.sqrt((n.data.x-cx)**2 + (n.data.y-cy)**2)));
    }
    dists.sort((a,b) => a-b);
    return {
      count: pn.size,
      minDist: dists[0],
      maxDist: dists[dists.length-1],
      distRange: dists[dists.length-1] - dists[0],
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.distRange).toBeGreaterThan(50);
});

test("concentric nodes are angularly distributed around center", async () => {
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
  // Nodes should be distributed across all 4 quadrants
  for (const q of result.quadrants) {
    expect(q).toBeGreaterThan(0);
  }
});

test("concentric vs grid produces different radial pattern", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const concentricShot = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const gridShot = await page.screenshot();

  const len = Math.min(concentricShot.length, gridShot.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (concentricShot[i] !== gridShot[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});
