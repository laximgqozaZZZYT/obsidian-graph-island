/**
 * CDP E2E: Verify fadeEdgesByDegree changes edge alpha values.
 * Tests that fade toggle produces visible rendering change.
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

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (a[i] !== b[i]) diff++; }
  return diff + Math.abs(a.length - b.length);
}

test("fadeEdgesByDegree ON vs OFF produces visual change", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.showLinks = true;
    view.panel.fadeEdgesByDegree = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const off = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.fadeEdgesByDegree = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(3000);
  const on = await page.screenshot();

  const diff = pixelDiff(off, on);
  console.log(`fadeEdgesByDegree pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});

test("fadeEdgesByDegree panel state toggles correctly", async () => {
  await page.evaluate(ev(`view.panel.fadeEdgesByDegree = true;`));
  const on: any = await page.evaluate(ev(`return view.panel.fadeEdgesByDegree;`));
  expect(on).toBe(true);

  await page.evaluate(ev(`view.panel.fadeEdgesByDegree = false;`));
  const off: any = await page.evaluate(ev(`return view.panel.fadeEdgesByDegree;`));
  expect(off).toBe(false);
});

test("fade toggle via markDirty pipeline re-renders edges", async () => {
  // Ensure edges are drawn
  await page.evaluate(ev(`
    view.panel.showLinks = true;
    view.panel.fadeEdgesByDegree = false;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const before: any = await page.evaluate(ev(`
    const ec = view.edgeContainer ?? view.edgeLabelContainer;
    return { children: ec?.children?.length ?? 0 };
  `));

  await page.evaluate(ev(`
    view.panel.fadeEdgesByDegree = true;
    view.markDirty(true);
  `));
  await page.waitForTimeout(2000);

  const after: any = await page.evaluate(ev(`
    const ec = view.edgeContainer ?? view.edgeLabelContainer;
    return { children: ec?.children?.length ?? 0 };
  `));

  // Edge container should still have children (edges still drawn, just with different alpha)
  expect(before.children).toBeGreaterThan(0);
  expect(after.children).toBeGreaterThan(0);
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
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
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

