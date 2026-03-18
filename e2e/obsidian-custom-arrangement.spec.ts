/**
 * CDP E2E Test -- Custom Arrangement Patterns
 *
 * Verifies custom arrangement pattern functionality:
 * expression-based layouts, axis source configuration, and polar/cartesian systems.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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

test("custom arrangement with expression produces node positions", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "sqrt(t)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "i*2.39996", scale: 1 } },
      perGroup: true,
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));
    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.arrangement).toBe("custom");
});

test("cartesian custom arrangement positions nodes on 2D plane", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 10 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 5 } },
      perGroup: true,
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const xs: number[] = []; const ys: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) { xs.push(pn.data.x); ys.push(pn.data.y); }
    }
    return { xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0, yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.xRange).toBeGreaterThan(0);
  expect(result.yRange).toBeGreaterThan(0);
});

test("coordinateLayout constants are accessible in expressions", async () => {
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
    return { nodeCount: view.pixiNodes?.size ?? 0, constants: panel.coordinateLayout?.constants };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.constants.k).toBe(5);
  expect(result.constants.d).toBe(0.5);
});
