/**
 * CDP E2E: Verify arrangement patterns produce correct node counts.
 * Tests that switching arrangements maintains node count and alters positions.
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

test("each arrangement preserves the same node count", async () => {
  const arrangements = ["grid", "concentric", "triangle", "radial", "phyllotaxis"];
  const counts: Record<string, number> = {};

  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  for (const arr of arrangements) {
    await page.evaluate(ev(`
      view.panel.clusterArrangement = "${arr}";
      view.panel.coordinateLayout = null;
      view.applyClusterForce();
      await view.doRender();
    `));
    await page.waitForTimeout(5000);

    const count: any = await page.evaluate(ev(`
      return view.pixiNodes?.size ?? 0;
    `));
    counts[arr] = count;
    expect(count).toBeGreaterThan(50);
  }

  // All arrangements should have the same node count (data doesn't change)
  const vals = Object.values(counts);
  const first = vals[0];
  for (const v of vals) {
    expect(v).toBe(first);
  }
  console.log("Node counts per arrangement:", JSON.stringify(counts));
});

test("random arrangement produces spread positions", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "random";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, xSpread: 0, ySpread: 0 };
    const xs = [], ys = [];
    for (const [, n] of pn) { xs.push(n.data.x); ys.push(n.data.y); }
    return {
      count: pn.size,
      xSpread: Math.max(...xs) - Math.min(...xs),
      ySpread: Math.max(...ys) - Math.min(...ys),
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.xSpread).toBeGreaterThan(50);
  expect(result.ySpread).toBeGreaterThan(50);
});

test("triangle arrangement positions nodes correctly", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "triangle";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { count: 0, spread: 0 };
    const xs = [], ys = [];
    for (const [, n] of pn) { xs.push(n.data.x); ys.push(n.data.y); }
    return {
      count: pn.size,
      xSpread: Math.max(...xs) - Math.min(...xs),
      ySpread: Math.max(...ys) - Math.min(...ys),
    };
  `));

  expect(result.count).toBeGreaterThan(50);
  expect(result.xSpread + result.ySpread).toBeGreaterThan(100);
});
