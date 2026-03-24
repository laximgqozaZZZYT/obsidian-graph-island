/**
 * Shared Playwright fixture for smoke tests.
 * Connects to Obsidian CDP once per worker (not per file).
 *
 * Usage in smoke test files:
 *   import { test, expect } from "../helpers/smoke-fixture";
 *   // `page` and `browser` are already connected to Obsidian via CDP
 */
import { test as base, expect, type Page, type Browser } from "@playwright/test";
import { chromium } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

export { expect };

/** Find the Graph Island view (not built-in graph). */
export const FIND_VIEW_EXPR = `
  app.workspace.getLeavesOfType('graph-view')
    .find(l => 'pixiNodes' in l.view)?.view
`;

/** Wait for graph rendering to stabilize. Returns node count. */
async function waitStableImpl(page: Page, initialWaitMs = 4000, minThreshold = 200): Promise<number> {
  await page.waitForTimeout(initialWaitMs);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => {
      const v = (window as any).app.workspace
        .getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    if (s === last && s > minThreshold) { stable++; if (stable >= 2) return s; }
    else { last = s; stable = 0; }
    await page.waitForTimeout(500);
  }
  return last;
}

type SmokeFixtures = {
  cdpPage: Page;
  cdpBrowser: Browser;
  waitStable: (initialWaitMs?: number, minThreshold?: number) => Promise<number>;
  renderWith: (settings: Record<string, unknown>) => Promise<number>;
};

export const test = base.extend<object, SmokeFixtures>({
  cdpBrowser: [async ({}, use) => {
    let browser!: Browser;
    for (let i = 0; i < 3; i++) {
      try {
        browser = await chromium.connectOverCDP(CDP_URL);
        break;
      } catch {
        if (i === 2) throw new Error("CDP connection failed after 3 attempts");
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    await use(browser);
  }, { scope: "worker" }],

  cdpPage: [async ({ cdpBrowser }, use) => {
    const pages = cdpBrowser.contexts()[0].pages();
    const page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
    // Ensure graph view is open and stable on first use
    await waitStableImpl(page, 4000, 200);
    await use(page);
  }, { scope: "worker" }],

  waitStable: [async ({ cdpPage }, use) => {
    await use((initialWaitMs = 2000, minThreshold = 200) =>
      waitStableImpl(cdpPage, initialWaitMs, minThreshold));
  }, { scope: "worker" }],

  renderWith: [async ({ cdpPage }, use) => {
    await use(async (settings: Record<string, unknown>) => {
      await cdpPage.evaluate(async ({ settings: s }) => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (!v) return;
        for (const [k, val] of Object.entries(s)) v.panel[k] = val;
        v.rawData = null;
        await v.doRender();
        await new Promise(r => setTimeout(r, 200));
        for (const [k, val] of Object.entries(s)) v.panel[k] = val;
      }, { settings });
      return waitStableImpl(cdpPage, 2000);
    });
  }, { scope: "worker" }],
});
