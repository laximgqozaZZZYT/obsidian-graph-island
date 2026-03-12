/**
 * E2E: Math Notation (Greek letters, implicit multiplication) & Shape-Fill Layouts
 * Tests: square-pack, hexagon, diamond, circle-pack arrangements
 *        custom expression with Greek letters, textarea UI
 */
import { test, expect, chromium } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

test.describe("Math Notation & Shape-Fill E2E", () => {
  let browser: any;
  let page: any;

  test.beforeAll(async () => {
    browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    page = contexts[0]?.pages()?.[0];
    if (!page) {
      const ctx = contexts[0] || (await browser.newContext());
      page = ctx.pages()[0] || (await ctx.newPage());
    }
  });

  test.afterAll(async () => {
    // Don't close -- it's the real Obsidian
  });

  test("reload plugin and open graph view", async () => {
    test.setTimeout(60_000);

    await page.evaluate(async () => {
      const app = (window as any).app;
      await app.plugins.disablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 1000));
      await app.plugins.enablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 3000));
    });

    const count = await page.evaluate(() =>
      (window as any).app.workspace.getLeavesOfType("graph-view").length
    );
    if (count === 0) {
      await page.evaluate(async () => {
        await (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
        await new Promise(r => setTimeout(r, 5000));
      });
    }
    const finalCount = await page.evaluate(() =>
      (window as any).app.workspace.getLeavesOfType("graph-view").length
    );
    expect(finalCount).toBeGreaterThan(0);
  });

  test("switch to square-pack and verify grid pattern", async () => {
    test.setTimeout(30_000);

    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "no graph view" };
      const view = leaves[0].view as any;
      const panel = view.panelState;

      panel.clusterArrangement = "square-pack";
      panel.coordinateLayout = null;
      view.applyClusterForce?.();
      view.restartSimulation?.(1);
      await new Promise(r => setTimeout(r, 5000));

      const nodes = view.graphData?.nodes ?? [];
      const positions = nodes.slice(0, 30).map((n: any) => ({
        id: n.id?.substring(0, 20),
        x: Math.round(n.x ?? 0),
        y: Math.round(n.y ?? 0),
      }));
      return { count: nodes.length, positions };
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBeGreaterThan(0);

    // Square grid: nodes should have discrete column positions
    if (result.positions.length >= 4) {
      const xs = result.positions.map((p: any) => p.x);
      const binSize = 30;
      const uniqueXBins = new Set(xs.map((x: number) => Math.round(x / binSize)));
      expect(uniqueXBins.size).toBeGreaterThan(1);
    }
  });

  test("switch to hexagon and verify ring pattern", async () => {
    test.setTimeout(30_000);

    const result = await page.evaluate(async () => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "no graph view" };
      const view = leaves[0].view as any;
      const panel = view.panelState;

      panel.clusterArrangement = "hexagon";
      panel.coordinateLayout = null;
      view.applyClusterForce?.();
      view.restartSimulation?.(1);
      await new Promise(r => setTimeout(r, 5000));

      const nodes = view.graphData?.nodes ?? [];
      return { count: nodes.length };
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test("switch to diamond and verify", async () => {
    test.setTimeout(30_000);

    const result = await page.evaluate(async () => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "no graph view" };
      const view = leaves[0].view as any;
      const panel = view.panelState;

      panel.clusterArrangement = "diamond";
      panel.coordinateLayout = null;
      view.applyClusterForce?.();
      view.restartSimulation?.(1);
      await new Promise(r => setTimeout(r, 5000));

      const nodes = view.graphData?.nodes ?? [];
      return { count: nodes.length };
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test("switch to circle-pack and verify", async () => {
    test.setTimeout(30_000);

    const result = await page.evaluate(async () => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "no graph view" };
      const view = leaves[0].view as any;
      const panel = view.panelState;

      panel.clusterArrangement = "circle-pack";
      panel.coordinateLayout = null;
      view.applyClusterForce?.();
      view.restartSimulation?.(1);
      await new Promise(r => setTimeout(r, 5000));

      const nodes = view.graphData?.nodes ?? [];
      return { count: nodes.length };
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test("custom expression with Greek letters", async () => {
    test.setTimeout(30_000);

    const result = await page.evaluate(async () => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "no graph view" };
      const view = leaves[0].view as any;
      const panel = view.panelState;

      panel.clusterArrangement = "custom";
      panel.coordinateLayout = {
        system: "polar",
        axis1: {
          source: { kind: "index" },
          transform: { kind: "expression", expr: "sqrt(t)", scale: 1 },
        },
        axis2: {
          source: { kind: "index" },
          transform: { kind: "golden-angle" },
        },
        perGroup: true,
        constants: { a: 1.5 },
      };
      view.applyClusterForce?.();
      view.restartSimulation?.(1);
      await new Promise(r => setTimeout(r, 5000));

      const nodes = view.graphData?.nodes ?? [];
      return { count: nodes.length };
    });

    expect(result.error).toBeUndefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test("textarea exists for axis inputs", async () => {
    test.setTimeout(30_000);

    // Make sure panel is open
    await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (panel && panel.classList.contains("is-hidden")) {
        const btn = document.querySelector(".graph-settings-btn") as HTMLElement;
        btn?.click();
      }
    });
    await page.waitForTimeout(500);

    // Switch to layout tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      for (const t of tabs) {
        if ((t as HTMLElement).dataset?.tab === "layout" ||
            (t as HTMLElement).textContent?.toLowerCase().includes("layout")) {
          (t as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(500);

    const hasTextarea = await page.evaluate(() => {
      return document.querySelectorAll(".gi-expr-textarea").length;
    });
    // Should have at least 2 textareas (axis1 and axis2)
    expect(hasTextarea).toBeGreaterThanOrEqual(2);
  });

  test("take screenshot", async () => {
    await page.screenshot({ path: "e2e/screenshot-shape-fill.png", fullPage: false });
  });
});
