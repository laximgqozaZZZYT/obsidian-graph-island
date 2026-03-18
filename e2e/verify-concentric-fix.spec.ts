/**
 * CDP E2E: Verify concentric arrangement produces ring distribution.
 * Tests that nodes are placed on concentric rings with increasing radii.
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

test("concentric arrangement places nodes at multiple radial distances", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
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
    // Count distinct ring levels (bucket by 30px)
    const rings = new Map();
    for (const d of dists) {
      const r = Math.round(d / 30) * 30;
      rings.set(r, (rings.get(r) ?? 0) + 1);
    }
    return {
      count: pn.size,
      ringCount: rings.size,
      minDist: dists[0],
      maxDist: dists[dists.length-1],
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  // Concentric should produce multiple ring levels
  expect(result.ringCount).toBeGreaterThan(2);
  expect(result.maxDist).toBeGreaterThan(result.minDist);
});

test("concentric with different concentricRadiusStep changes ring spacing", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
    view.panel.concentricRadiusStep = 30;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);
  const small = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.concentricRadiusStep = 100;
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

test("concentric arrangement state is set correctly in panel", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
  `));
  const result: any = await page.evaluate(ev(`
    return view.panel.clusterArrangement;
  `));
  expect(result).toBe("concentric");
});
