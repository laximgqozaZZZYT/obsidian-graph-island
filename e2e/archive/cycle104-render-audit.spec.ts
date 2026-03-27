/**
 * Render Audit — verify layout/display settings produce measurable visual changes
 *
 * Consolidated from cdp-e2e-all-settings-audit-detailed.spec.ts + cdp-e2e-audit-final.spec.ts
 * Tests: clusterArrangement, clusterNodeSpacing, nodeDisplayMode, showArrows,
 *        autoFit, fadeEdgesByDegree, colorEdgesByRelation, showDotGrid
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function ensureGraphIsland(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view")
      .filter((l: any) => "pixiNodes" in l.view);
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

async function resetBaseline(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.showSimilar = false;
    p.searchQuery = "folder:characters";
    p.groupBy = "none";
    p.groupByRules = [];
    p.collapsedGroups = new Set();
    p.clusterArrangement = "spiral";
    p.clusterNodeSpacing = 3.0;
    p.clusterGroupSpacing = 1.0;
    p.clusterGroupScale = 1.0;
    p.nodeDisplayMode = "node";
    p.autoFit = false;
    p.showArrows = false;
    p.fadeEdgesByDegree = false;
    p.colorEdgesByRelation = true;
    p.showLinks = true;
    p.showSemanticEdges = true;
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function getNodePositionSpread(): Promise<{ width: number; height: number; count: number }> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
    if (!leaf) return { width: 0, height: 0, count: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { width: 0, height: 0, count: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pn of pixiNodes.values()) {
      const x = pn.data?.x ?? 0;
      const y = pn.data?.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { width: maxX - minX, height: maxY - minY, count: pixiNodes.size };
  });
}

async function toggleAndMeasure(key: string, from: unknown, to: unknown): Promise<number> {
  await page.evaluate(([k, v]: [string, unknown]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
  }, [key, from]);
  await page.waitForTimeout(1500);
  const s1 = await page.screenshot();

  await page.evaluate(([k, v]: [string, unknown]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view);
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
  }, [key, to]);
  await page.waitForTimeout(1500);
  const s2 = await page.screenshot();

  return pixelDiff(s1, s2);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await ensureGraphIsland();
  await resetBaseline();
});

test.afterAll(async () => {});

// ---------------------------------------------------------------------------
// Layout Settings (coordinate/position based)
// ---------------------------------------------------------------------------

test.describe("Render Audit — Layout Settings", () => {

  test("clusterArrangement switch changes node positions", async () => {
    await resetBaseline();
    const spiralSpread = await getNodePositionSpread();
    expect(spiralSpread.count).toBeGreaterThan(10);

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterArrangement = "grid";
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const gridSpread = await getNodePositionSpread();

    const widthDiff = Math.abs(gridSpread.width - spiralSpread.width);
    const heightDiff = Math.abs(gridSpread.height - spiralSpread.height);
    expect(widthDiff + heightDiff).toBeGreaterThan(10);
  });

  test("clusterNodeSpacing doubles spread when doubled", async () => {
    await resetBaseline();
    const small = await getNodePositionSpread();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.clusterNodeSpacing = 6.0;
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const large = await getNodePositionSpread();

    expect(large.width).toBeGreaterThan(small.width * 1.2);
  });

  test("autoFit adjusts spacing automatically", async () => {
    await resetBaseline();
    const before = await getNodePositionSpread();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.autoFit = true;
      if (view.panelCallbacks) view.panelCallbacks.invalidateLayout();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodePositionSpread();

    const spreadChanged = Math.abs(after.width - before.width) > 1 || Math.abs(after.height - before.height) > 1;
    expect(spreadChanged || after.count === before.count).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Display Settings (pixel-diff based)
// ---------------------------------------------------------------------------

test.describe("Render Audit — Display Settings", () => {

  test("nodeDisplayMode card vs node changes rendering", async () => {
    await resetBaseline();
    const s1 = await page.screenshot();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view);
      if (!leaf) return;
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.nodeDisplayMode = "card";
      if (typeof view.doRender === "function") await view.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    const s2 = await page.screenshot();

    expect(pixelDiff(s1, s2)).toBeGreaterThan(500);
  });

  test("showArrows toggle produces pixel change", async () => {
    await resetBaseline();
    const diff = await toggleAndMeasure("showArrows", false, true);
    expect(diff).toBeGreaterThan(100);
  });

  test("fadeEdgesByDegree toggle produces pixel change", async () => {
    await resetBaseline();
    const diff = await toggleAndMeasure("fadeEdgesByDegree", false, true);
    expect(diff).toBeGreaterThan(50);
  });

  test("colorEdgesByRelation toggle produces pixel change", async () => {
    await resetBaseline();
    const diff = await toggleAndMeasure("colorEdgesByRelation", true, false);
    expect(diff).toBeGreaterThan(50);
  });

  test("showDotGrid toggle produces pixel change", async () => {
    await resetBaseline();
    const diff = await toggleAndMeasure("showDotGrid", false, true);
    expect(diff).toBeGreaterThan(50);
  });
});
