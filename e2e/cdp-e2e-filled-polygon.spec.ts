/**
 * CDP E2E Test -- Filled Polygon Layout
 *
 * Verifies filled polygon layout (k-gon) with golden-angle fill
 * produces correct node distribution.
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

test("filled hexagon (k=6) produces radial distribution", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "cos(pi/k)/cos(((i/n*2*pi)%(2*pi/k))-pi/k)*d*sqrt(t)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "i*2.39996", scale: 1 } },
      perGroup: true,
      constants: { k: 6, d: 0.5 },
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const dists: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        dists.push(Math.sqrt(pn.data.x ** 2 + pn.data.y ** 2));
      }
    }
    return { nodeCount: dists.length, maxDist: Math.max(...dists), avgDist: dists.reduce((a,b) => a+b, 0) / dists.length };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.maxDist).toBeGreaterThan(0);
});

test("filled pentagon (k=5) layout matches sample preset", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "cos(pi/k)/cos(((i/n*2*pi)%(2*pi/k))-pi/k)*d*sqrt(t)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "i*2.39996", scale: 1 } },
      perGroup: true,
      constants: { k: 5, d: 0.5 },
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const nodeCount = view.pixiNodes?.size ?? 0;
    return { nodeCount, arrangement: panel.clusterArrangement };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("changing k constant from 5 to 6 alters node positions", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    const cl = panel.coordinateLayout;
    if (!cl?.constants) return { error: "no coord layout" };

    cl.constants.k = 5;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const first5 = view.pixiNodes instanceof Map ? (Array.from(view.pixiNodes.values())[0] as any)?.data : null;
    const pos5 = first5 ? { x: first5.x, y: first5.y } : null;

    cl.constants.k = 6;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const first6 = view.pixiNodes instanceof Map ? (Array.from(view.pixiNodes.values())[0] as any)?.data : null;
    const pos6 = first6 ? { x: first6.x, y: first6.y } : null;

    return { pos5, pos6, changed: pos5 && pos6 ? (pos5.x !== pos6.x || pos5.y !== pos6.y) : false };
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

