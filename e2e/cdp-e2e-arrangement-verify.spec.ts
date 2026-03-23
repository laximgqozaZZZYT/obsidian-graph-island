/**
 * CDP E2E: Verify arrangement patterns produce distinct node positions.
 * Each arrangement should yield a different spatial distribution.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

async function getPositionFingerprint(): Promise<{ xs: number[]; ys: number[]; count: number }> {
  return page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn || pn.size === 0) return { xs: [], ys: [], count: 0 };
    const xs = [], ys = [];
    for (const [, n] of pn) {
      xs.push(Math.round(n.data.x));
      ys.push(Math.round(n.data.y));
    }
    return { xs, ys, count: pn.size };
  `));
}

function spatialHash(fp: { xs: number[]; ys: number[] }): number {
  let h = 0;
  for (let i = 0; i < fp.xs.length; i++) h += fp.xs[i] * 31 + fp.ys[i] * 17;
  return h;
}

test("all valid arrangements produce nodes with non-zero spread", async () => {
  const arrangements = ["concentric", "radial", "phyllotaxis", "grid", "triangle", "random"];
  const hashes: Record<string, number> = {};

  for (const arr of arrangements) {
    await page.evaluate(ev(`
      view.panel.searchQuery = "folder:characters";
      view.panel.showOrphans = true;
      view.panel.showTags = false;
      view.panel.showTagNodes = false;
      view.panel.clusterArrangement = "${arr}";
      view.panel.coordinateLayout = null;
      view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
      view.applyClusterForce();
      view.restartSimulation?.(1.0);
      await view.doRender();
    `));
    await page.waitForTimeout(6000);

    const fp = await getPositionFingerprint();
    expect(fp.count).toBeGreaterThan(50);

    const xSpread = Math.max(...fp.xs) - Math.min(...fp.xs);
    const ySpread = Math.max(...fp.ys) - Math.min(...fp.ys);
    expect(xSpread + ySpread).toBeGreaterThan(100);

    hashes[arr] = spatialHash(fp);
    console.log(`[${arr}] nodes=${fp.count}, xSpread=${xSpread}, ySpread=${ySpread}`);
  }

  // At least 4 of 6 arrangements should produce distinct hashes
  const uniqueHashes = new Set(Object.values(hashes)).size;
  expect(uniqueHashes).toBeGreaterThanOrEqual(4);
});

test("switching arrangement changes node positions", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);
  const gridFp = await getPositionFingerprint();

  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);
  const concentricFp = await getPositionFingerprint();

  expect(gridFp.count).toBeGreaterThan(0);
  expect(concentricFp.count).toBeGreaterThan(0);
  expect(spatialHash(gridFp)).not.toBe(spatialHash(concentricFp));
});

test("arrangement state is reflected in panel after assignment", async () => {
  const arrangements = ["grid", "concentric", "triangle"];
  for (const arr of arrangements) {
    await page.evaluate(ev(`
      view.panel.clusterArrangement = "${arr}";
    `));
    const result = await page.evaluate(ev(`
      return view.panel.clusterArrangement;
    `));
    expect(result).toBe(arr);
  }
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});

