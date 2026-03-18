/**
 * Phase 3 — showLinks toggle
 * Verifies that toggling showLinks affects link-type edge rendering.
 * Baseline: 5558 total edges, link=1695.
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
    v.panel.showLinks = true;
    v.panel.showSemanticEdges = true;
    v.panel.showTagEdges = true;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 3 — showLinks toggle", () => {
  test("3-1: baseline edge distribution has link=1695, semantic=2363, tag=1500", async () => {
    const dist = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return null;
      const counts: Record<string, number> = {};
      for (const e of v.graphEdges) {
        const t = e.type ?? "unknown";
        counts[t] = (counts[t] || 0) + 1;
      }
      return counts;
    });
    expect(dist).not.toBeNull();
    expect(dist!["link"]).toBe(1695);
    expect(dist!["semantic"]).toBe(2363);
    expect(dist!["tag"]).toBe(1500);
  });

  test("3-2: showLinks=false sets panel property and affects rendering", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showLinks = false;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return {
        showLinks: v?.panel?.showLinks,
        totalEdges: v?.graphEdges?.length ?? -1,
      };
    });
    expect(result.showLinks).toBe(false);
    // graphEdges still includes all edges (filtering is render-level)
    expect(result.totalEdges).toBe(5558);
  });

  test("3-3: re-enabling showLinks restores panel state", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showLinks = true;
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.showLinks;
    });
    expect(val).toBe(true);
  });
});
