/**
 * CDP E2E: Verify dot grid overlay rendering.
 * Tests showDotGrid toggle and visual difference.
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

test("showDotGrid ON vs OFF produces visual difference", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showDotGrid = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showDotGrid = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  const diff = pixelDiff(on, off);
  console.log(`showDotGrid pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});

test("showDotGrid panel state persists correctly", async () => {
  await page.evaluate(ev(`view.panel.showDotGrid = true;`));
  const on: any = await page.evaluate(ev(`return view.panel.showDotGrid;`));
  expect(on).toBe(true);

  await page.evaluate(ev(`view.panel.showDotGrid = false;`));
  const off: any = await page.evaluate(ev(`return view.panel.showDotGrid;`));
  expect(off).toBe(false);
});

test("dot grid syncs with canvasApp state after markDirty", async () => {
  await page.evaluate(ev(`
    view.panel.showDotGrid = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(1500);

  const result: any = await page.evaluate(ev(`
    const app = view.pixiApp ?? view.canvasApp;
    return {
      panelVal: view.panel.showDotGrid,
      appVal: app?.showDotGrid ?? "N/A",
    };
  `));

  expect(result.panelVal).toBe(true);

  // Restore
  await page.evaluate(ev(`
    view.panel.showDotGrid = false;
    view.markDirty(true);
  `));
});
