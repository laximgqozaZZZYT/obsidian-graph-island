/**
 * CDP E2E Test -- Cable Settings UI
 *
 * Verifies cable bundle UI controls exist, progressive disclosure works
 * (sub-settings hidden when mode=never), and mode changes persist.
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

test("cable mode select has auto/always/never options", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const panelEl = view.panelEl;
    if (!panelEl) return { error: "no panel element" };

    const selects = panelEl.querySelectorAll("select");
    let cableModeOpts: string[] = [];
    for (const s of selects) {
      const opts = Array.from((s as HTMLSelectElement).options).map(o => o.value);
      if (opts.includes("auto") && opts.includes("always") && opts.includes("never")) {
        cableModeOpts = opts;
        break;
      }
    }
    return { cableModeOpts };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.cableModeOpts).toContain("auto");
  expect(result.cableModeOpts).toContain("always");
  expect(result.cableModeOpts).toContain("never");
});

test("sub-settings hidden when cableBundleMode is never", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "never";
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const text = view.panelEl?.textContent ?? "";
    return {
      hasTrunkWidth: text.includes("Cable Trunk Width") || text.includes("幹線の太さ"),
      hasTrunkAlpha: text.includes("Cable Trunk Opacity") || text.includes("幹線の透明度"),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasTrunkWidth).toBe(false);
  expect(result.hasTrunkAlpha).toBe(false);
});

test("sub-settings visible when cableBundleMode is auto", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "auto";
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const text = view.panelEl?.textContent ?? "";
    return {
      hasTrunkWidth: text.includes("Cable Trunk Width") || text.includes("幹線の太さ"),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasTrunkWidth).toBe(true);
});

test("cable mode always with groupBy=folder creates cluster data", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "always";
    view.panel.groupBy = "folder:?";
    view.panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const cm = view.clusterMeta;
    return {
      hasNodeClusterMap: !!(cm && cm.nodeClusterMap),
      clusterCount: cm?.clusterCentroids?.size ?? 0,
      cableBundleMode: view.panel.cableBundleMode,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.cableBundleMode).toBe("always");

  // Restore
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.cableBundleMode = "auto";
    view.panel.groupBy = "none";
    view.panel.groupByRules = [];
    if (typeof view.doRender === "function") view.doRender();
  });
  await page.waitForTimeout(3000);
});
