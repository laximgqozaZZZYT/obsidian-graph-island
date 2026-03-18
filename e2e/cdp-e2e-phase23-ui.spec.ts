/**
 * Phase 23 — groupBy setting
 * Verifies that setting groupBy creates group clusters and collapsed groups.
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
    v.panel.groupBy = "";
    v.panel.collapsedGroups = new Set();
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 23 — groupBy setting", () => {
  test("23-1: no groupBy shows 2354 individual nodes", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(2354);
  });

  test("23-2: groupBy=folder:? creates folder-based groups", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.groupBy = "folder:?";
      v.panel.collapsedGroups = new Set();
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return null;
      // When collapsedGroups is empty, all groups auto-collapse to super nodes
      let superNodeCount = 0;
      for (const pn of v.pixiNodes.values()) {
        if (pn.node?.collapsedMembers && pn.node.collapsedMembers.length > 0) {
          superNodeCount++;
        }
      }
      return {
        visibleNodes: v.pixiNodes.size,
        superNodeCount,
        groupBy: v.panel.groupBy,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.groupBy).toBe("folder:?");
    // With groupBy active and auto-collapse, visible nodes should be fewer than 2354
    expect(result!.visibleNodes).toBeLessThan(2354);
  });

  test("23-3: clearing groupBy restores all nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.groupBy = "";
      v.panel.collapsedGroups = new Set();
      v.rawData = null;
      v.doRender();
    });
    await page.waitForTimeout(6000);

    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(2354);
  });
});
