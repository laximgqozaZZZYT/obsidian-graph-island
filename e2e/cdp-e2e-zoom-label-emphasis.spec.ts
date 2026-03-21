/**
 * CDP E2E Test -- Zoom-out label emphasis verification
 * Verifies that labels get enhanced background at low zoom for readability.
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

test("labels have enhanced bgAlpha at zoom-out", async () => {
  test.setTimeout(60_000);

  // Measure bgAlpha at zoom=1.0
  const atZoom1 = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(1.0);
    view.updateLabelsForZoom();
    await new Promise(r => setTimeout(r, 500));
    const pns = view.pixiNodes;
    const alphas: number[] = [];
    for (const [, pn] of pns) {
      if (pn.label?.visible && pn.label.bgAlpha != null) {
        alphas.push(pn.label.bgAlpha);
        if (alphas.length >= 20) break;
      }
    }
    return { avgBgAlpha: alphas.reduce((a, b) => a + b, 0) / alphas.length, count: alphas.length };
  });

  // Measure bgAlpha at zoom=0.3
  const atZoom03 = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(0.3);
    view.updateLabelsForZoom();
    await new Promise(r => setTimeout(r, 500));
    const pns = view.pixiNodes;
    const alphas: number[] = [];
    const paddings: number[] = [];
    for (const [, pn] of pns) {
      if (pn.label?.visible && pn.label.bgAlpha != null) {
        alphas.push(pn.label.bgAlpha);
        if (pn.label.bgPadX != null) paddings.push(pn.label.bgPadX);
        if (alphas.length >= 20) break;
      }
    }
    return {
      avgBgAlpha: alphas.reduce((a, b) => a + b, 0) / alphas.length,
      avgPadX: paddings.length > 0 ? paddings.reduce((a, b) => a + b, 0) / paddings.length : 0,
      count: alphas.length,
    };
  });

  console.log("zoom=1.0:", JSON.stringify(atZoom1));
  console.log("zoom=0.3:", JSON.stringify(atZoom03));

  expect(atZoom1).not.toHaveProperty("error");
  expect(atZoom03).not.toHaveProperty("error");

  // At zoom=0.3, bgAlpha should be higher than at zoom=1.0
  if ("avgBgAlpha" in atZoom1 && "avgBgAlpha" in atZoom03) {
    expect(atZoom03.avgBgAlpha).toBeGreaterThan(atZoom1.avgBgAlpha);
  }

  // Reset
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) { view.worldContainer.scale.set(1); view.updateLabelsForZoom(); }
  });
});

test("zoom indicator shows label count at zoom-out", async () => {
  test.setTimeout(30_000);

  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.worldContainer.scale.set(0.3);
    view.updateLabelsForZoom();
    if (typeof view.updateZoomIndicator === "function") view.updateZoomIndicator(0.3);
    await new Promise(r => setTimeout(r, 500));

    // Find zoom indicator element
    const el = view.containerEl?.querySelector?.(".gi-zoom-indicator");
    return {
      text: el?.textContent ?? "not found",
      hasLabelCount: el?.textContent?.includes("L") ?? false,
    };
  });

  console.log("zoom indicator:", JSON.stringify(result));
  expect(result).not.toHaveProperty("error");
  expect(result.hasLabelCount).toBe(true);

  // Reset
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) { view.worldContainer.scale.set(1); view.updateLabelsForZoom(); view.updateZoomIndicator(1); }
  });
});
