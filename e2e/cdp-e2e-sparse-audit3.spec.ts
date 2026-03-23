/**
 * Sparse Audit v3 — verify filtering first, then test render toggles on sparse graph
 *
 * Confirms that the filter pipeline correctly reduces nodes, then validates
 * that rendering toggles produce visual changes on the smaller dataset.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function setupSparse(): Promise<number> {
  return page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return 0;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.showSimilar = false;
    p.showLinks = true;
    p.showSemanticEdges = true;
    p.showArrows = false;
    p.clusterArrangement = "spiral";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2500));
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    return pn?.size ?? 0;
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
});

test.afterAll(async () => {});

test.describe("Sparse Audit v3 — Filter Then Toggle", () => {

  test("sparse filter correctly reduces node count", async () => {
    const count = await setupSparse();
    expect(count).toBeGreaterThan(50);
    expect(count).toBeLessThan(500);
    console.log(`sparse filter: ${count} nodes`);
  });

  test("showArrows toggle visible on sparse graph", async () => {
    await setupSparse();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showArrows = true;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`showArrows on sparse: diff=${diff}`);
  });

  test("arrangement change visible on sparse graph", async () => {
    await setupSparse();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`arrangement spiral->grid on sparse: diff=${diff}`);
  });

  test("colorEdgesByRelation toggle visible on sparse graph", async () => {
    await setupSparse();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.colorEdgesByRelation = !p.colorEdgesByRelation;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
      await new Promise(r => setTimeout(r, 1500));
    });
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`colorEdgesByRelation toggle on sparse: diff=${diff}`);
  });
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

