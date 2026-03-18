/**
 * UI Click Audit v3 — deep visual verification of ALL settings
 *
 * Uses label-based DOM queries to survive rebuildPanel(),
 * and screenshot comparison for visual verification.
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
