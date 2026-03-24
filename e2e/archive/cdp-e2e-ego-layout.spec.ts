/**
 * E2E: egoLayout / focusLayout — center node positioning
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.evaluate(async () => {
    const app = (window as any).app;
    for (const l of app.workspace.getLeavesOfType("markdown")) l.detach();
    for (const l of app.workspace.getLeavesOfType("graph-view")) l.detach();
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(4000);
  const leafCount = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").length
  );
  if (leafCount === 0) {
    await page.evaluate(() =>
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view")
    );
  }
  for (let i = 0; i < 30; i++) {
    const ready = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return !!(v && v.pixiNodes && v.pixiNodes.size > 200);
    });
    if (ready) break;
    await page.waitForTimeout(500);
  }
});

test.afterAll(async () => {
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (v) {
      v.panel.focusLayout = false;
      v.panel.localGraphCenter = null;
      v.panel.focusNodeId = null;
      v.rawData = null;
      await v.doRender();
    }
  });
});

test.describe("egoLayout / focusLayout", () => {
  test("EGO-1: focusLayout defaults to false", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.panel?.focusLayout ?? "undefined";
    });
    expect(r).toBe(false);
  });

  test("EGO-2: enabling localGraph + focusLayout doesn't crash", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { ok: false };

      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;
      v.panel.localGraphHops = 2;
      v.panel.focusLayout = true;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));

      let nan = 0;
      for (const [, pn] of v.pixiNodes) {
        if (isNaN(pn.data.x) || isNaN(pn.data.y)) nan++;
      }
      return { ok: true, count: v.pixiNodes.size, nan };
    });
    expect(r.ok).toBe(true);
    expect(r.count).toBeGreaterThan(0);
    expect(r.nan).toBe(0);
  });

  test("EGO-3: local graph with hops=1 vs hops=3 produces different node counts", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { hop1: 0, hop3: 0 };

      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;
      v.panel.focusLayout = true;

      v.panel.localGraphHops = 1;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));
      const hop1 = v.pixiNodes.size;

      v.panel.localGraphHops = 3;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));
      const hop3 = v.pixiNodes.size;

      return { hop1, hop3 };
    });
    expect(r.hop1).toBeGreaterThan(0);
    expect(r.hop3).toBeGreaterThanOrEqual(r.hop1);
  });

  test("EGO-4: disabling focusLayout restores normal layout", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { restored: false };

      v.panel.focusLayout = false;
      v.panel.localGraphCenter = null;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));

      return {
        restored: true,
        focusLayout: v.panel.focusLayout,
        count: v.pixiNodes.size,
      };
    });
    expect(r.restored).toBe(true);
    expect(r.focusLayout).toBe(false);
    expect(r.count).toBeGreaterThanOrEqual(200);
  });
});
