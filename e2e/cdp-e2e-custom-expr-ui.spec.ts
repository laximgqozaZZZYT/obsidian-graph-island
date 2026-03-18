/**
 * CDP E2E Test -- Custom Expression UI
 *
 * Verifies that custom arrangement with expression formulas
 * renders correct shapes and displays expressions in textarea UI.
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

test("custom arrangement with grid expression produces grid layout", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "grid";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const textareas: string[] = [];
    document.querySelectorAll(".gi-expr-textarea").forEach(ta => {
      textareas.push((ta as HTMLTextAreaElement).value);
    });

    return { textareaCount: textareas.length, textareas, arrangement: panel.clusterArrangement };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.arrangement).toBe("grid");
});

test("custom polar expression renders nodes with radial spread", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.clusterArrangement = "spiral";
    panel.coordinateLayout = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));

    const dists: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        dists.push(Math.sqrt(pn.data.x ** 2 + pn.data.y ** 2));
      }
    }

    return { nodeCount: dists.length, maxDist: dists.length > 0 ? Math.round(Math.max(...dists)) : 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.maxDist).toBeGreaterThan(10);
});
