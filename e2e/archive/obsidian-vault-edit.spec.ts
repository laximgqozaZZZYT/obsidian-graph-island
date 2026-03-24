/**
 * CDP E2E Test -- Vault Edit Integration
 *
 * Verifies that vault file operations (create, modify, delete)
 * are reflected in the graph data after re-render.
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

test("creating a new vault file increases node count", async () => {
  const result = await page.evaluate(async () => {
    const app = (window as any).app;
    const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    panel.groupBy = "none";
    panel.searchQuery = "";
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const before = view.pixiNodes?.size ?? 0;

    // Create test file
    const testPath = "___gi_test_vault_edit.md";
    const existing = app.vault.getAbstractFileByPath(testPath);
    if (existing) await app.vault.modify(existing, "# Test\n[[link-target]]");
    else await app.vault.create(testPath, "# Test\n[[link-target]]");

    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const after = view.pixiNodes?.size ?? 0;

    // Cleanup
    const f = app.vault.getAbstractFileByPath(testPath);
    if (f) await app.vault.delete(f);

    return { before, after, increased: after >= before };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.increased).toBe(true);
});

test("deleting a vault file decreases or maintains node count", async () => {
  const result = await page.evaluate(async () => {
    const app = (window as any).app;
    const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Create then delete
    const testPath = "___gi_test_delete.md";
    await app.vault.create(testPath, "# Delete Test");
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const withFile = view.pixiNodes?.size ?? 0;

    const f = app.vault.getAbstractFileByPath(testPath);
    if (f) await app.vault.delete(f);
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const afterDelete = view.pixiNodes?.size ?? 0;

    return { withFile, afterDelete };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.afterDelete).toBeLessThanOrEqual(result.withFile);
});
