/**
 * CDP E2E: Verify deferred rendering pipeline.
 * World container should be hidden during simulation and visible after completion.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

test("world container is visible after render completes", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  const result: any = await page.evaluate(ev(`
    const wc = view.worldContainer;
    return {
      exists: !!wc,
      visible: wc?.visible ?? false,
      alpha: wc?.alpha ?? 0,
      nodeCount: view.pixiNodes?.size ?? 0,
    };
  `));

  expect(result.exists).toBe(true);
  expect(result.visible).toBe(true);
  expect(result.alpha).toBeGreaterThan(0);
  expect(result.nodeCount).toBeGreaterThan(50);
});

test("pixiApp stage has children after render", async () => {
  const result: any = await page.evaluate(ev(`
    const app = view.pixiApp ?? view.canvasApp;
    if (!app) return { hasApp: false };
    return {
      hasApp: true,
      stageChildren: app.stage?.children?.length ?? 0,
      hasWorldContainer: !!view.worldContainer,
    };
  `));

  expect(result.hasApp).toBe(true);
  expect(result.stageChildren).toBeGreaterThan(0);
  expect(result.hasWorldContainer).toBe(true);
});

test("re-render after arrangement change completes with visible nodes", async () => {
  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(8000);

  const result: any = await page.evaluate(ev(`
    const wc = view.worldContainer;
    const pn = view.pixiNodes;
    let visibleNodes = 0;
    if (pn) {
      for (const [, n] of pn) {
        if (n.visible !== false) visibleNodes++;
      }
    }
    return {
      worldVisible: wc?.visible ?? false,
      totalNodes: pn?.size ?? 0,
      visibleNodes,
    };
  `));

  expect(result.worldVisible).toBe(true);
  expect(result.totalNodes).toBeGreaterThan(50);
  expect(result.visibleNodes).toBeGreaterThan(0);
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

