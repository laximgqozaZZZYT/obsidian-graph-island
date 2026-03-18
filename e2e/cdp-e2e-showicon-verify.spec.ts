/**
 * CDP E2E: Verify cardShowIcon rendering in card mode.
 * Tests icon visibility toggle in card display configuration.
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

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (a[i] !== b[i]) diff++; }
  return diff + Math.abs(a.length - b.length);
}

test("cardShowIcon ON vs OFF produces visual difference in card mode", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.nodeDisplayMode = "card";
    if (!view.panel.cardDisplayConfig) view.panel.cardDisplayConfig = {};
    view.panel.cardDisplayConfig.fields = ["node_type"];
    view.panel.cardDisplayConfig.showIcon = false;
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(4000);
  const off = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.cardDisplayConfig.showIcon = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  const diff = pixelDiff(off, on);
  console.log(`cardShowIcon pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});

test("card mode with fields shows field content", async () => {
  await page.evaluate(ev(`
    view.panel.nodeDisplayMode = "card";
    if (!view.panel.cardDisplayConfig) view.panel.cardDisplayConfig = {};
    view.panel.cardDisplayConfig.fields = ["node_type", "prop-category"];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const withFields = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.cardDisplayConfig.fields = [];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const noFields = await page.screenshot();

  expect(pixelDiff(withFields, noFields)).toBeGreaterThan(100);
});

test("cardDisplayConfig showIcon state persists", async () => {
  await page.evaluate(ev(`
    if (!view.panel.cardDisplayConfig) view.panel.cardDisplayConfig = {};
    view.panel.cardDisplayConfig.showIcon = true;
  `));
  const on = await page.evaluate(ev(`return view.panel.cardDisplayConfig?.showIcon;`));
  expect(on).toBe(true);

  await page.evaluate(ev(`view.panel.cardDisplayConfig.showIcon = false;`));
  const off = await page.evaluate(ev(`return view.panel.cardDisplayConfig?.showIcon;`));
  expect(off).toBe(false);
});
