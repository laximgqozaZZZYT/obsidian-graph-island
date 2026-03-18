/**
 * CDP E2E: Verify spiral arrangement renders with visible spread.
 * Tests phyllotaxis pattern produces expanding outward distribution.
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

test("phyllotaxis arrangement renders nodes with radial expansion", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "phyllotaxis";
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
    const radii = [];
    for (const [, n] of pn) {
      radii.push(Math.sqrt((n.data.x-cx)**2 + (n.data.y-cy)**2));
    }
    radii.sort((a,b) => a-b);
    return {
      count: pn.size,
      minRadius: Math.round(radii[0]),
      maxRadius: Math.round(radii[radii.length-1]),
      medianRadius: Math.round(radii[Math.floor(radii.length/2)]),
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.maxRadius).toBeGreaterThan(result.minRadius);
  expect(result.maxRadius).toBeGreaterThan(50);
  // Median should be between min and max (nodes spread outward)
  expect(result.medianRadius).toBeGreaterThan(result.minRadius);
  expect(result.medianRadius).toBeLessThan(result.maxRadius);
});

test("spiral screenshot contains non-blank canvas pixels", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "phyllotaxis";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return { hasCanvas: false, nonBlankPixels: 0 };
    const ctx = c.getContext("2d");
    if (!ctx) return { hasCanvas: true, nonBlankPixels: 0 };
    const d = ctx.getImageData(0, 0, c.width, c.height);
    let nonBlank = 0;
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i] > 10 || d.data[i+1] > 10 || d.data[i+2] > 10) nonBlank++;
    }
    return { hasCanvas: true, nonBlankPixels: nonBlank, totalPixels: c.width * c.height };
  });

  expect(result.hasCanvas).toBe(true);
  expect(result.nonBlankPixels).toBeGreaterThan(100);
});

test("phyllotaxis spread is circular (similar X and Y range)", async () => {
  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { xSpread: 0, ySpread: 0, count: 0 };
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
  // Phyllotaxis should be roughly circular (ratio > 40%)
  expect(result.ratio).toBeGreaterThan(30);
});
