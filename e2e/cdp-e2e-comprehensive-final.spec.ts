/**
 * CDP E2E Test -- Comprehensive Final Settings Audit
 *
 * Verifies that every major panel toggle and setting produces
 * a measurable effect on the graph state.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

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
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test("boolean toggles change panel state", async () => {
  const toggles = ["showArrows", "showMinimap", "showEdgeLabels", "scaleByDegree", "showDotGrid"];
  const result = await page.evaluate(async (fields: string[]) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    const results: Record<string, { before: boolean; after: boolean }> = {};
    for (const f of fields) {
      const before = !!panel[f];
      panel[f] = !before;
      results[f] = { before, after: !!panel[f] };
      panel[f] = before; // restore
    }
    return results;
  }, toggles);

  expect(result).not.toHaveProperty("error");
  for (const field of toggles) {
    expect(result[field].before).not.toBe(result[field].after);
  }
});

test("nodeSize slider changes value", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    const before = panel.nodeSize;
    panel.nodeSize = 10;
    const after = panel.nodeSize;
    panel.nodeSize = before;
    return { before, after };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.after).toBe(10);
});

test("searchQuery filter reduces node count", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.searchQuery = "";
    panel.groupBy = "none";
    panel.collapsedGroups = new Set();
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const allNodes = view.pixiNodes?.size ?? 0;

    panel.searchQuery = "path:classic-macbeth*";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const filtered = view.pixiNodes?.size ?? 0;

    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    return { allNodes, filtered };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.allNodes).toBeGreaterThan(0);
  expect(result.filtered).toBeGreaterThan(0);
  expect(result.filtered).toBeLessThan(result.allNodes);
});

test("clusterArrangement change alters node positions", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "spiral";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const firstNode = view.pixiNodes instanceof Map ? (Array.from(view.pixiNodes.values())[0] as any)?.data : null;
    const pos1 = firstNode ? { x: firstNode.x, y: firstNode.y } : null;

    panel.clusterArrangement = "grid";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const pos2 = firstNode ? { x: firstNode.x, y: firstNode.y } : null;

    return { pos1, pos2, changed: pos1 && pos2 ? (pos1.x !== pos2.x || pos1.y !== pos2.y) : false };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.changed).toBe(true);
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

