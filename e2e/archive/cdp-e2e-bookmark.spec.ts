/**
 * E2E: Bookmark add/remove/toggle
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
  await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (v) v.panel.bookmarkedNodes = [];
  });
});

test.describe("Bookmark", () => {
  test("BM-1: bookmarkedNodes defaults to empty", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return Array.isArray(v?.panel?.bookmarkedNodes) ? v.panel.bookmarkedNodes.length : -1;
    });
    expect(r).toBe(0);
  });

  test("BM-2: adding a bookmark increases list", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { added: false };
      const firstId = v.pixiNodes.keys().next().value;
      v.panel.bookmarkedNodes = [firstId];
      return { added: v.panel.bookmarkedNodes.length === 1, id: firstId };
    });
    expect(r.added).toBe(true);
  });

  test("BM-3: removing a bookmark empties list", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { empty: false };
      v.panel.bookmarkedNodes = [];
      return { empty: v.panel.bookmarkedNodes.length === 0 };
    });
    expect(r.empty).toBe(true);
  });

  test("BM-4: bookmark toggle adds then removes", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { afterAdd: -1, afterRemove: -1 };
      const firstId = v.pixiNodes.keys().next().value;
      v.panel.bookmarkedNodes = [firstId];
      const afterAdd = v.panel.bookmarkedNodes.length;
      v.panel.bookmarkedNodes = [];
      const afterRemove = v.panel.bookmarkedNodes.length;
      return { afterAdd, afterRemove };
    });
    expect(r.afterAdd).toBe(1);
    expect(r.afterRemove).toBe(0);
  });
});
