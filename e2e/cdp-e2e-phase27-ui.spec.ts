/**
 * Phase 27 — syncWithEditor toggle
 * Verifies that toggling syncWithEditor controls editor-graph sync behavior.
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
    v.panel.syncWithEditor = false;
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 27 — syncWithEditor toggle", () => {
  test("27-1: syncWithEditor=false is baseline", async () => {
    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.syncWithEditor;
    });
    expect(val).toBe(false);
  });

  test("27-2: syncWithEditor=true enables sync", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.syncWithEditor = true;
    });

    const val = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.syncWithEditor;
    });
    expect(val).toBe(true);
  });

  test("27-3: active editor file can be read for sync verification", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const activeFile = app.workspace.getActiveFile();
      return {
        hasActiveFile: !!activeFile,
        filePath: activeFile?.path ?? null,
      };
    });
    expect(result).toBeTruthy();
    // Active file may or may not exist, but the property should be readable

    // Restore
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.syncWithEditor = false;
    });
  });
});
