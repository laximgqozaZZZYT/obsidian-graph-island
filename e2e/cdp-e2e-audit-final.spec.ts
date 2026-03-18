/**
 * Audit Final — edge settings, render thresholds, and coordinate layout verification
 *
 * Tests rendering-only settings by comparing screenshots before/after toggle.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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
    p.showTags = false;
    p.showTagNodes = false;
    p.searchQuery = "folder:characters";
    p.clusterArrangement = "spiral";
    p.showLinks = true;
    p.showSemanticEdges = true;
    p.showArrows = false;
    p.colorEdgesByRelation = true;
    p.fadeEdgesByDegree = false;
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

async function toggleAndMeasure(key: string, from: unknown, to: unknown): Promise<number> {
  await page.evaluate(([k, v]: [string, unknown]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    (p as any)[k] = v;
    if (view.panelCallbacks) view.panelCallbacks.markDirty();
  }, [key, from]);
  await page.waitForTimeout(1500);
  const s1 = await page.screenshot();

  await page.evaluate(([k, v]: [string, unknown]) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
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

test.describe("Audit Final — Rendering Settings", () => {

  test("showArrows toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndMeasure("showArrows", false, true);
    expect(diff).toBeGreaterThan(100);
    console.log(`showArrows: pixel diff = ${diff}`);
  });

  test("fadeEdgesByDegree toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndMeasure("fadeEdgesByDegree", false, true);
    expect(diff).toBeGreaterThan(50);
    console.log(`fadeEdgesByDegree: pixel diff = ${diff}`);
  });

  test("colorEdgesByRelation toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndMeasure("colorEdgesByRelation", true, false);
    expect(diff).toBeGreaterThan(50);
    console.log(`colorEdgesByRelation: pixel diff = ${diff}`);
  });

  test("showDotGrid toggle produces pixel change", async () => {
    await resetView();
    const diff = await toggleAndMeasure("showDotGrid", false, true);
    expect(diff).toBeGreaterThan(50);
    console.log(`showDotGrid: pixel diff = ${diff}`);
  });
});
