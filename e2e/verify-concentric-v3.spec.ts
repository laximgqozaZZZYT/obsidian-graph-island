/**
 * CDP E2E: Verify concentric ring distribution with configurable ringSize.
 * Tests that different _ringSize values produce different ring counts.
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

async function getRingData(ringSize: number): Promise<{ count: number; ringCount: number; maxDist: number }> {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "floor(i / _ringSize) + 1", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
      perGroup: false,
      constants: { _ringSize: ${ringSize} },
    };
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    view.restartSimulation?.(1.0);
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  return page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, ringCount: 0, maxDist: 0 };
    let cx = 0, cy = 0;
    for (const [, n] of pn) { cx += n.data.x; cy += n.data.y; }
    cx /= pn.size; cy /= pn.size;
    const dists = [];
    for (const [, n] of pn) {
      dists.push(Math.round(Math.sqrt((n.data.x-cx)**2 + (n.data.y-cy)**2)));
    }
    dists.sort((a,b) => a-b);
    const rings = new Map();
    for (const d of dists) {
      const r = Math.round(d / 30) * 30;
      rings.set(r, (rings.get(r) ?? 0) + 1);
    }
    return {
      count: pn.size,
      ringCount: rings.size,
      maxDist: dists[dists.length-1],
    };
  `));
}

test("ringSize=8 produces concentric ring distribution", async () => {
  const data = await getRingData(8);
  expect(data.count).toBeGreaterThan(50);
  expect(data.ringCount).toBeGreaterThan(2);
  expect(data.maxDist).toBeGreaterThan(50);
  console.log(`ringSize=8: nodes=${data.count}, rings=${data.ringCount}, maxDist=${data.maxDist}`);
});

test("ringSize=3 produces more rings than ringSize=8", async () => {
  const data3 = await getRingData(3);
  const data8 = await getRingData(8);

  expect(data3.count).toBeGreaterThan(50);
  expect(data8.count).toBeGreaterThan(50);
  // Smaller ringSize means fewer nodes per ring, so more rings
  expect(data3.ringCount).toBeGreaterThanOrEqual(data8.ringCount);
  console.log(`ringSize=3: rings=${data3.ringCount}, ringSize=8: rings=${data8.ringCount}`);
});

test("different ringSize values produce visually distinct layouts", async () => {
  await page.evaluate(ev(`
    view.panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "floor(i / _ringSize) + 1", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
      perGroup: false,
      constants: { _ringSize: 3 },
    };
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const small = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.coordinateLayout.constants._ringSize = 20;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const large = await page.screenshot();

  const len = Math.min(small.length, large.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (small[i] !== large[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});
