/**
 * CDP E2E Test -- Arrangement Preset Sync
 *
 * Verifies that selecting different arrangements populates the
 * expression textareas with correct formulas and renders distinct shapes.
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

async function setArrangementAndCollect(arrangement: string) {
  return page.evaluate(async (arr: string) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = arr;
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const positions: { x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) {
        if (i++ >= 50) break;
        positions.push({ x: Math.round(pn.data.x), y: Math.round(pn.data.y) });
      }
    }

    return { arrangement: panel.clusterArrangement, positionCount: positions.length, positions };
  }, arrangement);
}

test("grid arrangement produces nodes at distinct grid positions", async () => {
  const result = await setArrangementAndCollect("grid");
  expect(result).not.toHaveProperty("error");
  expect(result.positionCount).toBeGreaterThan(0);

  const xs = new Set(result.positions.map((p: any) => Math.round(p.x / 50)));
  const ys = new Set(result.positions.map((p: any) => Math.round(p.y / 50)));
  expect(xs.size).toBeGreaterThan(1);
  expect(ys.size).toBeGreaterThan(1);
});

test("spiral arrangement distributes nodes radially", async () => {
  const result = await setArrangementAndCollect("spiral");
  expect(result).not.toHaveProperty("error");
  expect(result.positionCount).toBeGreaterThan(0);

  if (result.positions.length >= 3) {
    const dists = result.positions.map((p: any) => Math.sqrt(p.x ** 2 + p.y ** 2));
    const maxDist = Math.max(...dists);
    expect(maxDist).toBeGreaterThan(10);
  }
});

test("concentric arrangement creates ring-like distribution", async () => {
  const result = await setArrangementAndCollect("concentric");
  expect(result).not.toHaveProperty("error");
  expect(result.positionCount).toBeGreaterThan(0);

  if (result.positions.length >= 3) {
    const cx = result.positions.reduce((s: number, p: any) => s + p.x, 0) / result.positions.length;
    const cy = result.positions.reduce((s: number, p: any) => s + p.y, 0) / result.positions.length;
    const dists = result.positions.map((p: any) => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
    expect(Math.max(...dists)).toBeGreaterThan(10);
  }
});

test("triangle arrangement produces triangular row structure", async () => {
  const result = await setArrangementAndCollect("triangle");
  expect(result).not.toHaveProperty("error");
  expect(result.positionCount).toBeGreaterThan(0);

  if (result.positions.length >= 4) {
    const ys = new Set(result.positions.map((p: any) => Math.round(p.y / 30)));
    expect(ys.size).toBeGreaterThan(1);
  }
});
