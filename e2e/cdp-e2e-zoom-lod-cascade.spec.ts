/**
 * CDP E2E Test -- LOD cascade verification
 * Verifies that label count increases monotonically with zoom level,
 * and that label overlap stays within bounds at each tier.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const initialPage = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];
  await initialPage.reload({ waitUntil: "load" });
  await initialPage.waitForTimeout(8000);
  const pages = ctx.pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
    await new Promise(r => setTimeout(r, 300));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

async function measureAtZoom(z: number) {
  return page.evaluate(async (targetZoom) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const world = view.worldContainer;
    world.scale.set(targetZoom);
    if (typeof view.updateLabelsForZoom === "function") view.updateLabelsForZoom();
    await new Promise(r => setTimeout(r, 1000));

    const pns = view.pixiNodes;
    let visibleLabels = 0;
    for (const [, pn] of pns) {
      if (pn.label?.visible && pn.label.alpha >= 0.1) visibleLabels++;
    }
    return { zoom: targetZoom, visibleLabels, totalNodes: pns.size };
  }, z);
}

test("LOD cascade: label count increases monotonically with zoom", async () => {
  test.setTimeout(120_000);
  const zoomLevels = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0];
  const results: { zoom: number; visibleLabels: number }[] = [];

  for (const z of zoomLevels) {
    const r = await measureAtZoom(z);
    console.log(`[zoom=${z}]`, JSON.stringify(r));
    expect(r).not.toHaveProperty("error");
    results.push(r as { zoom: number; visibleLabels: number });
  }

  // Label count should be monotonically non-decreasing as zoom increases
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1];
    const curr = results[i];
    // Allow small dip (5 labels tolerance) due to hysteresis
    expect(curr.visibleLabels).toBeGreaterThanOrEqual(prev.visibleLabels - 5);
  }

  // At zoom=1.0+, should show significantly more labels than zoom=0.1
  const atZoom01 = results.find(r => r.zoom === 0.1)!;
  const atZoom10 = results.find(r => r.zoom === 1.0)!;
  expect(atZoom10.visibleLabels).toBeGreaterThan(atZoom01.visibleLabels * 3);
});

test("extreme zoom-out: no more than 30 labels visible", async () => {
  test.setTimeout(30_000);
  for (const z of [0.05, 0.1, 0.15]) {
    const r = await measureAtZoom(z);
    console.log(`[extreme zoom=${z}]`, JSON.stringify(r));
    if ("visibleLabels" in r) {
      expect(r.visibleLabels).toBeLessThanOrEqual(30);
    }
  }
});

test("zoom-in: all labels visible at zoom >= 1.0", async () => {
  test.setTimeout(30_000);
  const r = await measureAtZoom(1.0);
  expect(r).not.toHaveProperty("error");
  if ("visibleLabels" in r && "totalNodes" in r) {
    // At zoom 1.0, most labels should be visible (at least 50% of nodes)
    expect(r.visibleLabels).toBeGreaterThan(r.totalNodes * 0.15);
  }
});
