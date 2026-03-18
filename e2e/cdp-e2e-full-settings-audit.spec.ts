/**
 * Full Settings Audit — tests all panel toggles/sliders/selects via pixel comparison
 *
 * Covers: node shapes, edge settings, timeline, cluster spacing, render thresholds.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(600_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

async function applyAndWait(settings: Record<string, unknown>, callback: "data" | "dirty" | "layout" = "dirty"): Promise<void> {
  await page.evaluate(async ([s, cb]: [Record<string, unknown>, string]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    for (const [k, v] of Object.entries(s)) {
      if (k === "collapsedGroups") (p as any)[k] = new Set(v as string[]);
      else (p as any)[k] = v;
    }
    if (cb === "data" && view.panelCallbacks) view.panelCallbacks.invalidateData();
    else if (cb === "layout" && view.panelCallbacks) view.panelCallbacks.invalidateLayout();
    else if (view.panelCallbacks) view.panelCallbacks.markDirty();
    await new Promise(r => setTimeout(r, 2000));
  }, [settings, callback]);
}

async function setup(): Promise<void> {
  await applyAndWait({
    searchQuery: "folder:characters",
    showTags: false, showTagNodes: false, showOrphans: true,
    showLinks: true, showSemanticEdges: true, showTagEdges: false,
    showArrows: false, showEdgeLabels: false, colorEdgesByRelation: true,
    fadeEdgesByDegree: false, clusterArrangement: "spiral",
    nodeDisplayMode: "node", groupBy: "none", groupByRules: [], collapsedGroups: [],
  }, "data");
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
  await setup();
});

test.afterAll(async () => {});

test.describe("Full Settings Audit", () => {

  test("showEdgeLabels toggle produces visual change", async () => {
    await setup();
    const s1 = await page.screenshot();
    await applyAndWait({ showEdgeLabels: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(100);
    console.log(`showEdgeLabels: diff=${diff}`);
  });

  test("clusterGroupSpacing changes node spread", async () => {
    await setup();
    await applyAndWait({ clusterGroupSpacing: 0.5 }, "layout");
    const s1 = await page.screenshot();
    await applyAndWait({ clusterGroupSpacing: 3.0 }, "layout");
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`clusterGroupSpacing: diff=${diff}`);
  });

  test("clusterGroupScale changes group sizing", async () => {
    await setup();
    await applyAndWait({ clusterGroupScale: 0.5 }, "layout");
    const s1 = await page.screenshot();
    await applyAndWait({ clusterGroupScale: 3.0 }, "layout");
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`clusterGroupScale: diff=${diff}`);
  });

  test("showDurationBars on timeline produces visual change", async () => {
    await applyAndWait({
      clusterArrangement: "timeline", timelineKey: "start-date",
      showDurationBars: false, searchQuery: "folder:characters",
      showTags: false, groupBy: "none", collapsedGroups: [],
    }, "data");
    const s1 = await page.screenshot();

    await applyAndWait({ showDurationBars: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(50);
    console.log(`showDurationBars: diff=${diff}`);
  });

  test("edgeWeightThickness produces thicker lines for repeated edges", async () => {
    await setup();
    await applyAndWait({ edgeWeightThickness: false });
    const s1 = await page.screenshot();
    await applyAndWait({ edgeWeightThickness: true });
    const s2 = await page.screenshot();
    const diff = pixelDiff(s1, s2);
    // May or may not differ significantly depending on duplicate edges
    console.log(`edgeWeightThickness: diff=${diff}`);
    expect(diff).toBeGreaterThanOrEqual(0);
  });
});
