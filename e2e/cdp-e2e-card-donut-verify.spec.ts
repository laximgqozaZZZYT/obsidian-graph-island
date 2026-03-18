/**
 * CDP E2E: Verify card and donut nodeDisplayMode produce correct visual output.
 * Tests mode switching, donut inner radius, card fields, and card maxWidth.
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

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (a[i] !== b[i]) diff++; }
  return diff + Math.abs(a.length - b.length);
}

test("switching nodeDisplayMode between node, card, donut changes rendering", async () => {
  // Setup filtered graph
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.clusterArrangement = "grid";
    view.panel.coordinateLayout = null;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    view.panel.nodeDisplayMode = "node";
    await view.doRender();
  `));
  await page.waitForTimeout(4000);
  const nodeShot = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeDisplayMode = "card";
    if (!view.panel.cardDisplayConfig) view.panel.cardDisplayConfig = {};
    view.panel.cardDisplayConfig.fields = ["node_type", "prop-category"];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const cardShot = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeDisplayMode = "donut";
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const donutShot = await page.screenshot();

  const nodeVsCard = pixelDiff(nodeShot, cardShot);
  const nodeVsDonut = pixelDiff(nodeShot, donutShot);
  const cardVsDonut = pixelDiff(cardShot, donutShot);

  expect(nodeVsCard).toBeGreaterThan(1000);
  expect(nodeVsDonut).toBeGreaterThan(1000);
  expect(cardVsDonut).toBeGreaterThan(1000);
});

test("donut innerRadius change produces visual difference", async () => {
  await page.evaluate(ev(`
    view.panel.nodeDisplayMode = "donut";
    if (!view.panel.donutDisplayConfig) view.panel.donutDisplayConfig = {};
    view.panel.donutDisplayConfig.innerRadius = 0.1;
    await view.doRender();
  `));
  await page.waitForTimeout(2000);
  const small = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.donutDisplayConfig.innerRadius = 0.9;
    await view.doRender();
  `));
  await page.waitForTimeout(2000);
  const large = await page.screenshot();

  expect(pixelDiff(small, large)).toBeGreaterThan(100);
});

test("card headerStyle plain vs table produces visual difference", async () => {
  await page.evaluate(ev(`
    view.panel.nodeDisplayMode = "card";
    if (!view.panel.cardDisplayConfig) view.panel.cardDisplayConfig = {};
    view.panel.cardDisplayConfig.fields = ["node_type"];
    view.panel.cardDisplayConfig.headerStyle = "plain";
    await view.doRender();
  `));
  await page.waitForTimeout(2000);
  const plain = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.cardDisplayConfig.headerStyle = "table";
    await view.doRender();
  `));
  await page.waitForTimeout(2000);
  const table = await page.screenshot();

  expect(pixelDiff(plain, table)).toBeGreaterThan(100);
});

test("nodeDisplayMode value is correctly stored in panel", async () => {
  for (const mode of ["node", "card", "donut"]) {
    await page.evaluate(ev(`view.panel.nodeDisplayMode = "${mode}";`));
    const result = await page.evaluate(ev(`return view.panel.nodeDisplayMode;`));
    expect(result).toBe(mode);
  }
});
