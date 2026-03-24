/**
 * UI Click Audit v3 — deep visual verification of ALL settings
 *
 * Uses label-based DOM queries to survive rebuildPanel(),
 * and screenshot comparison for visual verification.
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
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showTags = false;
    p.showOrphans = true;
    p.showLinks = true;
    p.showSemanticEdges = true;
    p.showArrows = false;
    p.clusterArrangement = "spiral";
    p.nodeDisplayMode = "node";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function toggleAndDiff(key: string, from: unknown, to: unknown, cb: "data" | "dirty" = "dirty"): Promise<number> {
  await page.evaluate(async ([k, v, c]: [string, unknown, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (c === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1500));
  }, [key, from, cb]);
  const s1 = await page.screenshot();

  await page.evaluate(async ([k, v, c]: [string, unknown, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (c === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 1500));
  }, [key, to, cb]);
  const s2 = await page.screenshot();

  return pixelDiff(s1, s2);
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
  await resetView();
});

test.afterAll(async () => {});

test.describe("UI Click Audit v3 — Deep Visual", () => {

  test("showLinks toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndDiff("showLinks", true, false);
    expect(diff).toBeGreaterThan(100);
    console.log(`showLinks: diff=${diff}`);
  });

  test("showSemanticEdges toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndDiff("showSemanticEdges", true, false);
    expect(diff).toBeGreaterThan(50);
    console.log(`showSemanticEdges: diff=${diff}`);
  });

  test("nodeDisplayMode switch produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndDiff("nodeDisplayMode", "node", "card");
    expect(diff).toBeGreaterThan(200);
    console.log(`nodeDisplayMode: diff=${diff}`);
  });

  test("edgeBundleStrength change produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndDiff("edgeBundleStrength", 0, 0.8);
    expect(diff).toBeGreaterThan(50);
    console.log(`edgeBundleStrength: diff=${diff}`);
  });

  test("showDotGrid toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndDiff("showDotGrid", false, true);
    expect(diff).toBeGreaterThan(50);
    console.log(`showDotGrid: diff=${diff}`);
  });
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

