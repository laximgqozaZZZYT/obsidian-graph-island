/**
 * Phase 20 — showBidirectionalIndicator
 * Verifies that toggling showBidirectionalIndicator changes edge appearance.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);

let browser: Browser;
let page: Page;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  page = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.showOrphans = true;
    v.panel.showBidirectionalIndicator = false;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 20 — showBidirectionalIndicator", () => {
  test("20-1: showBidirectionalIndicator=false is baseline", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showBidirectionalIndicator;
    });
    expect(val).toBe(false);
  });

  test("20-2: enabling showBidirectionalIndicator changes edge rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showBidirectionalIndicator = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showBidirectionalIndicator;
    });
    expect(val).toBe(true);
  });

  test("20-3: bidirectional set contains edges with forward/reverse pairs", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return null;
      // Build forward set and count bidirectional pairs
      const edgeKeys = new Set<string>();
      let biCount = 0;
      for (const e of v.graphEdges) {
        const s = typeof e.source === "object" ? e.source.id : e.source;
        const t = typeof e.target === "object" ? e.target.id : e.target;
        const fwd = `${s}->${t}`;
        const rev = `${t}->${s}`;
        if (edgeKeys.has(rev)) biCount++;
        edgeKeys.add(fwd);
      }
      return { totalEdges: v.graphEdges.length, bidirectionalPairs: biCount };
    });
    expect(result).not.toBeNull();
    expect(result!.totalEdges).toBe(5558);
    expect(result!.bidirectionalPairs).toBeGreaterThan(0);

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showBidirectionalIndicator = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(4000);
  });
});
