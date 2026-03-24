/**
 * E2E: nodeDisplayMode switching (node/card)
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureCardReadability, measureLabelReadability, measureContrast } from "./helpers/quality-checks";

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
    if (v) { v.panel.nodeDisplayMode = "node"; v.rawData = null; await v.doRender(); }
  });
});

test.describe("nodeDisplayMode switching", () => {
  test("DM-1: node mode is default", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.panel?.nodeDisplayMode ?? "unknown";
    });
    expect(r).toBe("node");
  });

  test("DM-2: card mode setting persists", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { mode: "" };
      v.panel.nodeDisplayMode = "card";
      return { mode: v.panel.nodeDisplayMode };
    });
    expect(r.mode).toBe("card");
  });

  test("DM-3: switching to card mode doesn't crash", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { ok: false };
      v.panel.nodeDisplayMode = "card";
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));
      return { ok: true, count: v.pixiNodes.size };
    });
    expect(r.ok).toBe(true);
    expect(r.count).toBeGreaterThan(0);
    // === Display Quality: card mode should produce readable cards ===
    const cardQ = await measureCardReadability(page);
    if (cardQ.totalCards > 0) {
      expect(cardQ.tooSmallCards).toBeLessThan(cardQ.totalCards);
    }
    const contrast = await measureContrast(page, 50);
    expect(contrast.avgRatio).toBeGreaterThan(1.5);
  });

  test("DM-4: restore to node mode preserves nodes", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { count: 0, nan: 0 };
      v.panel.nodeDisplayMode = "node";
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 2000));
      let nan = 0;
      for (const [, pn] of v.pixiNodes) if (isNaN(pn.data.x) || isNaN(pn.data.y)) nan++;
      return { count: v.pixiNodes.size, nan };
    });
    expect(r.count).toBeGreaterThan(100);
    expect(r.nan).toBe(0);
    // === Display Quality: restored node mode should have good overlap/spread ===
    const overlap = await measureNodeOverlap(page);
    expect(overlap.overlapRatio).toBeLessThan(0.10);
    const spread = await measureSpread(page);
    expect(spread.nanCount).toBe(0);
    expect(spread.spreadRatio).toBeGreaterThan(0.05);
  });

  test("DM-5: roundtrip node→card→node has no NaN", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { nan: 0 };
      for (const mode of ["card", "node", "card", "node"]) {
        v.panel.nodeDisplayMode = mode;
        v.rawData = null;
        await v.doRender();
        await new Promise(r => setTimeout(r, 1000));
      }
      let nan = 0;
      for (const [, pn] of v.pixiNodes) if (isNaN(pn.data.x) || isNaN(pn.data.y)) nan++;
      return { nan, count: v.pixiNodes.size };
    });
    expect(r.nan).toBe(0);
    expect(r.count).toBeGreaterThan(0);
    // === Display Quality: after roundtrip, labels should be readable ===
    const labelQ = await measureLabelReadability(page);
    if (labelQ.totalVisible > 5) {
      expect(labelQ.tooSmallCount).toBeLessThan(labelQ.totalVisible * 0.8);
    }
  });
});
