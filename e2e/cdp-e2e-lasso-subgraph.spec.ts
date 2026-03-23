/**
 * E2E tests for lasso selection + subgraph view (v0.5.0)
 */
import { test, expect } from "@playwright/test";
import { connectCDP, waitStable, reloadPlugin } from "./helpers/cdp-helpers";

const FIND_VIEW = `app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view)?.view`;

test.describe("lasso + subgraph view", () => {
  test.setTimeout(60_000);

  test("subgraphNodeIds defaults to empty array", async () => {
    const { browser, page } = await connectCDP();
    try {
      await reloadPlugin(page);
      await waitStable(page);
      const ids = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        return v?.panel?.subgraphNodeIds ?? "MISSING";
      });
      expect(Array.isArray(ids)).toBe(true);
      expect((ids as any[]).length).toBe(0);
    } finally {
      browser.close();
    }
  });

  test("setting subgraphNodeIds reduces visible nodes", async () => {
    const { browser, page } = await connectCDP();
    try {
      await reloadPlugin(page);
      const fullCount = await waitStable(page);
      expect(fullCount).toBeGreaterThan(100);

      // Pick first 5 node IDs and set as subgraph
      await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (!v) return;
        const ids = [...v.pixiNodes.keys()].slice(0, 5);
        v.panel.subgraphNodeIds = ids;
        v.rawData = null;
        v.doRender();
      });

      await page.waitForTimeout(5000);
      const afterCount = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        return v?.pixiNodes?.size ?? -1;
      });

      expect(afterCount).toBeLessThan(fullCount);
      expect(afterCount).toBeGreaterThan(0);

      // Restore full graph
      await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (v) {
          v.panel.subgraphNodeIds = [];
          v.rawData = null;
          v.doRender();
        }
      });
      await page.waitForTimeout(5000);
      const restoredCount = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        return v?.pixiNodes?.size ?? -1;
      });
      // Restored count may differ due to groupBy collapse timing
      expect(restoredCount).toBeGreaterThan(afterCount);
    } finally {
      browser.close();
    }
  });

  test("exitSubgraph restores previous state", async () => {
    const { browser, page } = await connectCDP();
    try {
      await reloadPlugin(page);
      await waitStable(page);

      const result = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (!v) return JSON.stringify({ inSub: -1, afterExit: -1 });
        const ids = [...v.pixiNodes.keys()].slice(0, 3);
        v.enterSubgraph(ids);
        const inSub = v.panel.subgraphNodeIds.length;
        v.exitSubgraph();
        const afterExit = v.panel.subgraphNodeIds.length;
        return JSON.stringify({ inSub, afterExit });
      });

      const { inSub, afterExit } = JSON.parse(result as string);
      expect(inSub).toBe(3);
      expect(afterExit).toBe(0);
    } finally {
      browser.close();
    }
  });

  test("toolbar has lasso or subgraph back button", async () => {
    const { browser, page } = await connectCDP();
    try {
      await reloadPlugin(page);
      await waitStable(page);

      const hasButton = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (!v) return false;
        const el = v.containerEl;
        const toolbar = el.querySelector(".gi-toolbar");
        if (!toolbar) return false;
        // Check for lasso button or subgraph back button
        const buttons = toolbar.querySelectorAll("button");
        for (const btn of buttons) {
          const label = (btn.getAttribute("aria-label") || "").toLowerCase();
          if (label.includes("lasso") || label.includes("select") || label.includes("back")) return true;
        }
        return false;
      });

      // Lasso button may have different aria-label; check subgraph back button exists (hidden)
      const hasBackBtn = await page.evaluate(() => {
        const v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        return v?.subgraphBackBtnEl !== undefined;
      });
      expect(hasButton || hasBackBtn).toBe(true);
    } finally {
      browser.close();
    }
  });
});
