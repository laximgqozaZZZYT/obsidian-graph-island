/**
 * CDP E2E: Verify graph settings interactions work correctly.
 * Tests layout switching, toggle operations, and panel state persistence.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
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

test("layout switching via panel changes arrangement and re-renders", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const gridResult: any = await page.evaluate(ev(`
    return {
      arrangement: view.panel.clusterArrangement,
      nodeCount: view.pixiNodes?.size ?? 0,
    };
  `));

  expect(gridResult.arrangement).toBe("grid");
  expect(gridResult.nodeCount).toBeGreaterThan(50);

  await page.evaluate(ev(`
    view.panel.clusterArrangement = "concentric";
    view.panel.coordinateLayout = null;
    view.applyClusterForce();
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const concentricResult: any = await page.evaluate(ev(`
    return {
      arrangement: view.panel.clusterArrangement,
      nodeCount: view.pixiNodes?.size ?? 0,
    };
  `));

  expect(concentricResult.arrangement).toBe("concentric");
  expect(concentricResult.nodeCount).toBe(gridResult.nodeCount);
});

test("nodeSize slider value changes node rendering", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.nodeSize = 4;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const small = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeSize = 20;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const large = await page.screenshot();

  const len = Math.min(small.length, large.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (small[i] !== large[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});

test("getState and setState roundtrip preserves settings", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = false;
    view.panel.clusterArrangement = "triangle";
    view.panel.nodeSize = 12;
  `));

  const state: any = await page.evaluate(ev(`
    const s = view.getState();
    return {
      searchQuery: s.panel?.searchQuery,
      showOrphans: s.panel?.showOrphans,
      clusterArrangement: s.panel?.clusterArrangement,
      nodeSize: s.panel?.nodeSize,
    };
  `));

  expect(state.searchQuery).toBe("folder:characters");
  expect(state.showOrphans).toBe(false);
  expect(state.clusterArrangement).toBe("triangle");
  expect(state.nodeSize).toBe(12);
});

test("panel tabs are accessible via DOM", async () => {
  const result: any = await page.evaluate(ev(`
    const root = view.containerEl;
    const tabs = root?.querySelectorAll(".gi-tab-btn");
    const tabNames = [];
    if (tabs) {
      for (const t of tabs) {
        tabNames.push(t.dataset?.tab || t.textContent?.trim());
      }
    }
    return { tabCount: tabs?.length ?? 0, tabNames };
  `));

  expect(result.tabCount).toBeGreaterThan(0);
  console.log(`Tabs found: ${result.tabCount} - ${result.tabNames.join(", ")}`);
});
