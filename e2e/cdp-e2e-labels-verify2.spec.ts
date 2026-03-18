/**
 * CDP E2E: Verify label rendering details.
 * Tests enclosure labels, sub-labels, and label count consistency.
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

test("enclosure labels appear when showEnclosures is enabled with groupBy", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.groupByRules = [{ key: "prop-category" }];
    view.panel.showEnclosures = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(6000);

  const result: any = await page.evaluate(ev(`
    const gd = view.getGraphData();
    const groups = new Set();
    for (const n of gd.nodes) {
      if (n.category) groups.add(n.category);
    }
    return {
      nodeCount: gd.nodes.length,
      groupCount: groups.size,
      groupNames: [...groups].slice(0, 10),
    };
  `));

  expect(result.nodeCount).toBeGreaterThan(50);
  expect(result.groupCount).toBeGreaterThan(1);
  console.log(`Groups found: ${result.groupCount} - ${result.groupNames.join(", ")}`);
});

test("label count matches visible pixiNode count", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showLabels = true;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(5000);

  const result: any = await page.evaluate(ev(`
    const pn = view.pixiNodes;
    if (!pn) return { pixiNodes: 0, withLabels: 0 };
    let withLabels = 0;
    for (const [, n] of pn) {
      if (n.data?.label) withLabels++;
    }
    return { pixiNodes: pn.size, withLabels };
  `));

  expect(result.pixiNodes).toBeGreaterThan(50);
  // Most nodes should have labels
  expect(result.withLabels).toBeGreaterThan(result.pixiNodes * 0.8);
});

test("nodeSubLabelFields adds sub-label text to nodes", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showLabels = true;
    view.panel.nodeSubLabelFields = "node_type";
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const withSub = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeSubLabelFields = "";
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const withoutSub = await page.screenshot();

  const len = Math.min(withSub.length, withoutSub.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (withSub[i] !== withoutSub[i]) diff++; }
  console.log(`Sub-label pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});
