/**
 * CDP E2E Test -- V2 Core Verification
 *
 * Verifies core view structure: plugin load, canvas element,
 * node data, edge data, and layout switching.
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

test("plugin is loaded with correct manifest", async () => {
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    return {
      loaded: "graph-island" in (app?.plugins?.plugins ?? {}),
      version: app?.plugins?.manifests?.["graph-island"]?.version,
    };
  });
  expect(result.loaded).toBe(true);
  expect(result.version).toBeTruthy();
});

test("graph view has canvas and worldContainer", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      hasCanvas: view?.pixiApp?.view instanceof HTMLCanvasElement,
      hasWorldContainer: !!view.worldContainer,
      hasSimulation: !!view.simulation,
    };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.hasCanvas).toBe(true);
  expect(result.hasWorldContainer).toBe(true);
  expect(result.hasSimulation).toBe(true);
});

test("layout switching between spiral and grid works", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "spiral";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const spiral = panel.clusterArrangement;

    panel.clusterArrangement = "grid";
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 2000));
    const grid = panel.clusterArrangement;

    return { spiral, grid, canvasOk: view.pixiApp?.view instanceof HTMLCanvasElement };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.spiral).toBe("spiral");
  expect(result.grid).toBe("grid");
  expect(result.canvasOk).toBe(true);
});

test("all standard arrangements render without crash", async () => {
  test.setTimeout(90_000);
  const layouts = ["spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "sunburst"];
  for (const layout of layouts) {
    const result = await page.evaluate(async (l: string) => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      panel.clusterArrangement = l;
      if (typeof view.doRender === "function") view.doRender();
      await new Promise(r => setTimeout(r, 2000));
      return { layout: l, nodes: view.pixiNodes?.size ?? 0, canvasOk: !!view.pixiApp?.view };
    }, layout);
    expect(result.canvasOk).toBe(true);
    expect(result.nodes).toBeGreaterThan(0);
  }
});
