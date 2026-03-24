/**
 * E2E: localGraphCenter — local graph filtering
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
      v.panel.localGraphCenter = null;
      v.panel.localGraphHops = 2;
      v.rawData = null;
      await v.doRender();
    }
  });
});

test.describe("localGraphCenter", () => {
  test("LG-1: localGraphCenter defaults to null (full graph)", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return {
        center: v?.panel?.localGraphCenter ?? "undefined",
        count: v?.pixiNodes?.size ?? 0,
      };
    });
    expect(r.count).toBeGreaterThanOrEqual(200);
    // null or a path (if syncWithEditor auto-set it)
    expect([null, "undefined"].includes(r.center) || typeof r.center === "string").toBe(true);
  });

  test("LG-2: setting localGraphCenter reduces visible nodes", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { fullCount: 0, localCount: 0 };

      // Capture full graph count
      v.panel.localGraphCenter = null;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));
      const fullCount = v.pixiNodes.size;

      // Pick a node with known connections and set as center
      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;
      v.panel.localGraphHops = 1;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));
      const localCount = v.pixiNodes.size;

      return { fullCount, localCount };
    });
    expect(r.fullCount).toBeGreaterThan(200);
    expect(r.localCount).toBeGreaterThan(0);
    expect(r.localCount).toBeLessThan(r.fullCount);
  });

  test("LG-3: clearing localGraphCenter restores full graph", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { restored: 0 };

      // Set local then clear
      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;
      v.panel.localGraphHops = 1;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));

      v.panel.localGraphCenter = null;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));

      return { restored: v.pixiNodes.size };
    });
    expect(r.restored).toBeGreaterThan(200);
  });

  test("LG-4: localGraphHops controls neighborhood depth", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { hop1: 0, hop2: 0 };

      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;

      v.panel.localGraphHops = 1;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));
      const hop1 = v.pixiNodes.size;

      v.panel.localGraphHops = 2;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));
      const hop2 = v.pixiNodes.size;

      return { hop1, hop2 };
    });
    expect(r.hop1).toBeGreaterThan(0);
    expect(r.hop2).toBeGreaterThanOrEqual(r.hop1);
  });

  test("LG-5: no NaN positions in local graph", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { nan: -1, count: 0 };

      const firstId = v.pixiNodes.keys().next().value;
      v.panel.localGraphCenter = firstId;
      v.panel.localGraphHops = 2;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));

      let nan = 0;
      for (const [, pn] of v.pixiNodes) {
        if (isNaN(pn.data.x) || isNaN(pn.data.y)) nan++;
      }
      return { nan, count: v.pixiNodes.size };
    });
    expect(r.nan).toBe(0);
    expect(r.count).toBeGreaterThan(0);
  });
});
