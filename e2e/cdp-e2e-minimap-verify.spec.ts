/**
 * CDP E2E: Verify minimap canvas dimensions and visibility toggle.
 * Tests showMinimap toggle, wrapper display, and minimap dimensions.
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

test("minimap wrapper is visible when showMinimap is true", async () => {
  await page.evaluate(ev(`
    view.panel.showMinimap = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const result: any = await page.evaluate(ev(`
    const wrap = view.containerEl?.querySelector(".gi-minimap-wrap");
    return {
      showMinimap: view.panel.showMinimap,
      wrapExists: !!wrap,
      wrapDisplay: wrap ? getComputedStyle(wrap).display : "N/A",
    };
  `));

  expect(result.showMinimap).toBe(true);
  expect(result.wrapExists).toBe(true);
  expect(result.wrapDisplay).not.toBe("none");
});

test("minimap wrapper is hidden when showMinimap is false", async () => {
  await page.evaluate(ev(`
    view.panel.showMinimap = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const result: any = await page.evaluate(ev(`
    const wrap = view.containerEl?.querySelector(".gi-minimap-wrap");
    return {
      showMinimap: view.panel.showMinimap,
      wrapDisplay: wrap?.style?.display ?? getComputedStyle(wrap).display ?? "N/A",
    };
  `));

  expect(result.showMinimap).toBe(false);
  // Wrapper should be hidden (display:none or not visible)
  expect(result.wrapDisplay === "none" || result.wrapDisplay === "N/A").toBe(true);
});

test("minimap canvas has non-zero dimensions", async () => {
  await page.evaluate(ev(`
    view.panel.showMinimap = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const result: any = await page.evaluate(ev(`
    const wrap = view.containerEl?.querySelector(".gi-minimap-wrap");
    const canvas = wrap?.querySelector("canvas");
    return {
      canvasExists: !!canvas,
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      wrapWidth: wrap?.offsetWidth ?? 0,
      wrapHeight: wrap?.offsetHeight ?? 0,
    };
  `));

  expect(result.canvasExists || result.wrapWidth > 0).toBe(true);
  if (result.canvasExists) {
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  }
});

test("minimap toggle ON/OFF produces visual difference", async () => {
  await page.evaluate(ev(`
    view.panel.showMinimap = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const on = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.showMinimap = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);
  const off = await page.screenshot();

  const len = Math.min(on.length, off.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (on[i] !== off[i]) diff++; }
  expect(diff).toBeGreaterThan(100);
});
