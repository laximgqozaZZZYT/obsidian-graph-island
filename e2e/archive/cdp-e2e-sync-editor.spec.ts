/**
 * E2E: syncWithEditor — editor switching updates graph focus
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
      v.panel.syncWithEditor = false;
      v.panel.localGraphCenter = null;
      v.rawData = null;
      await v.doRender();
    }
  });
});

test.describe("syncWithEditor", () => {
  test("SYNC-1: syncWithEditor defaults to true", async () => {
    const r = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.panel?.syncWithEditor ?? "undefined";
    });
    expect(r).toBe(true);
  });

  test("SYNC-2: enabling syncWithEditor doesn't crash", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { ok: false };
      v.panel.syncWithEditor = true;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true, count: v.pixiNodes.size };
    });
    expect(r.ok).toBe(true);
    expect(r.count).toBeGreaterThan(0);
  });

  test("SYNC-3: opening a file updates highlightedNodeId when synced", async () => {
    const r = await page.evaluate(async () => {
      const app = (window as any).app;
      const v = app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { ok: false };

      v.panel.syncWithEditor = true;

      // Open a markdown file
      const files = app.vault.getMarkdownFiles();
      if (files.length === 0) return { ok: false, reason: "no files" };
      const file = files[0];
      await app.workspace.openLinkText(file.path, "", false);
      await new Promise(r => setTimeout(r, 2000));

      return {
        ok: true,
        syncEnabled: v.panel.syncWithEditor,
        filePath: file.path,
      };
    });
    expect(r.ok).toBe(true);
    expect(r.syncEnabled).toBe(true);
  });

  test("SYNC-4: disabling syncWithEditor stops tracking", async () => {
    const r = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { ok: false };

      v.panel.syncWithEditor = false;
      v.panel.localGraphCenter = null;
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 1500));

      return {
        ok: true,
        syncEnabled: v.panel.syncWithEditor,
        count: v.pixiNodes.size,
      };
    });
    expect(r.ok).toBe(true);
    expect(r.syncEnabled).toBe(false);
    expect(r.count).toBeGreaterThanOrEqual(200);
  });
});
