/**
 * Real Audit — verify graph view is active and visible, then test all toggles
 *
 * Ensures the graph is in a visible workspace leaf before testing toggles,
 * validating that settings produce real rendering changes.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    } else {
      app.workspace.setActiveLeaf(leaves[0], { focus: true });
    }
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showTags = false;
    p.showOrphans = true;
    p.clusterArrangement = "spiral";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function toggleTest(key: string, valA: unknown, valB: unknown, callbackType: "data" | "dirty" = "dirty"): Promise<number> {
  await page.evaluate(async ([k, v, cb]: [string, unknown, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (cb === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1500));
  }, [key, valA, callbackType]);
  const s1 = await page.screenshot();

  await page.evaluate(async ([k, v, cb]: [string, unknown, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (cb === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1500));
  }, [key, valB, callbackType]);
  const s2 = await page.screenshot();

  return pixelDiff(s1, s2);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await resetView();
});

test.afterAll(async () => {});

test.describe("Real Audit — Active View Toggles", () => {

  test("showOrphans produces measurable change", async () => {
    await resetView();
    const diff = await toggleTest("showOrphans", true, false, "data");
    expect(diff).toBeGreaterThan(100);
    console.log(`showOrphans: diff=${diff}`);
  });

  test("showLinks produces visual change", async () => {
    await resetView();
    const diff = await toggleTest("showLinks", true, false);
    expect(diff).toBeGreaterThan(100);
    console.log(`showLinks: diff=${diff}`);
  });

  test("showArrows produces visual change", async () => {
    await resetView();
    const diff = await toggleTest("showArrows", false, true);
    expect(diff).toBeGreaterThan(50);
    console.log(`showArrows: diff=${diff}`);
  });

  test("nodeColorMode category vs default produces change", async () => {
    await resetView();
    const diff = await toggleTest("nodeColorMode", "default", "category");
    expect(diff).toBeGreaterThan(50);
    console.log(`nodeColorMode: diff=${diff}`);
  });
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

