/**
 * CDP E2E Test -- Deferred Rendering
 *
 * Verifies that deferred rendering correctly delays node drawing
 * until simulation settles, producing non-zero positions.
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

test("nodes have non-zero positions after render", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    let nonZero = 0;
    let total = 0;
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        total++;
        if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) nonZero++;
      }
    }
    return { total, nonZero, pct: total > 0 ? Math.round(nonZero / total * 100) : 0 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.total).toBeGreaterThan(0);
  expect(result.nonZero).toBeGreaterThan(result.total * 0.5);
});

test("simulation alpha decays to near zero after settling", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.simulation) return { error: "no simulation" };

    const alpha = view.simulation.alpha();
    return { alpha: Math.round(alpha * 1000) / 1000 };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.alpha).toBeLessThan(0.1);
});

test("restartSimulation increases alpha and re-settles", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.simulation) return { error: "no simulation" };

    if (typeof view.restartSimulation === "function") view.restartSimulation(1.0);
    const alphaAfterRestart = view.simulation.alpha();

    await new Promise(r => setTimeout(r, 5000));
    const alphaAfterSettle = view.simulation.alpha();

    return {
      alphaAfterRestart: Math.round(alphaAfterRestart * 100) / 100,
      alphaAfterSettle: Math.round(alphaAfterSettle * 1000) / 1000,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.alphaAfterRestart).toBeGreaterThan(0.5);
  expect(result.alphaAfterSettle).toBeLessThan(0.1);
});
