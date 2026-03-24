/**
 * CDP E2E: Verify minimap canvas dimensions and visibility toggle.
 * Tests showMinimap toggle, wrapper display, and minimap dimensions.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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


// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
});

// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
  }
});

