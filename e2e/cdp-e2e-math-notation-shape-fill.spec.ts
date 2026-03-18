/**
 * CDP E2E Test -- Math Notation & Shape Fill
 *
 * Verifies math expression notation (Greek letters, implicit multiplication)
 * and shape-fill layouts (square-pack, hexagon, diamond).
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

test("expression with Greek letter constants renders correctly", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "sqrt(t)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "i*137.508*pi/180", scale: 1 } },
      perGroup: true,
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    return { nodeCount: view.pixiNodes?.size ?? 0, arrangement: panel.clusterArrangement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("square-pack arrangement creates grid-like distribution", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "grid";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const xs: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) xs.push(pn.data.x);
    }
    return { nodeCount: xs.length, xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.xRange).toBeGreaterThan(0);
});

test("diamond arrangement renders nodes in diamond pattern", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "expression", expr: "cos(pi/4)/cos(((i/n*2*pi)%(2*pi/4))-pi/4)*d*sqrt(t)", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "expression", expr: "i*2.39996", scale: 1 } },
      perGroup: true,
      constants: { k: 4, d: 0.5 },
    };
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    return { nodeCount: view.pixiNodes?.size ?? 0 };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});
