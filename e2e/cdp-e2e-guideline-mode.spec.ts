// ---------------------------------------------------------------------------
// CDP E2E: Guide Line Mode — shared vs per-group timeline T-axis
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

/** Dismiss modals + close settings panel + activate graph leaf */
async function prepareGraphView(p: Page) {
  await p.evaluate(() => {
    const app = (window as any).app;
    if (app.setting?.close) app.setting.close();
    document.querySelectorAll(".modal-container .modal-close-button")
      .forEach(b => (b as HTMLElement).click());
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);

  await p.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (leaf) {
      app.workspace.setActiveLeaf(leaf, { focus: true });
      app.workspace.revealLeaf(leaf);
    }
  });
  await p.waitForTimeout(300);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);
  await prepareGraphView(page);
});

/** Helper: apply a panel state and wait for cluster metadata to settle */
async function applyAndWait(p: Page, panelOverrides: Record<string, any>) {
  await prepareGraphView(p);
  await p.evaluate(async (overrides: any) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) throw new Error("No graph-view leaf");
    const view = leaf.view;
    const current = view.getState();
    const newState = {
      ...current,
      layout: "force",
      panel: { ...current.panel, ...overrides, collapsedGroups: [] },
    };
    await view.setState(newState, {});
  }, panelOverrides);
  await p.waitForTimeout(10000);
}

test.describe("Guide Line Mode", () => {
  test("timeline shared mode produces guideLineData", async () => {
    await applyAndWait(page, {
      searchQuery: "path:classic-hamlet*",
      clusterGroupRules: [{ groupBy: "node_type:?", recursive: false }],
      clusterArrangement: "timeline",
      timelineKey: "start-date",
      showGuideLines: true,
      guideLineMode: "shared",
    });

    const result = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const meta = leaf?.view?.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        groupCount: meta?.guideLineData?.groups?.length ?? 0,
        arrangement: meta?.guideLineData?.arrangement ?? "none",
      };
    });

    expect(result.hasGuideData).toBe(true);
    expect(result.arrangement).toBe("timeline");
    expect(result.groupCount).toBeGreaterThan(0);
  });

  test("timeline per-group mode renders per-group guides", async () => {
    await applyAndWait(page, {
      searchQuery: "path:classic-hamlet*",
      clusterGroupRules: [{ groupBy: "node_type:?", recursive: false }],
      clusterArrangement: "timeline",
      timelineKey: "start-date",
      showGuideLines: true,
      guideLineMode: "per-group",
    });

    const result = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const meta = leaf?.view?.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        groupCount: meta?.guideLineData?.groups?.length ?? 0,
      };
    });

    expect(result.hasGuideData).toBe(true);
    expect(result.groupCount).toBeGreaterThan(0);
  });

  test("showGuideLines=false hides guide rendering but data still exists", async () => {
    await applyAndWait(page, {
      searchQuery: "path:classic-hamlet*",
      clusterGroupRules: [{ groupBy: "node_type:?", recursive: false }],
      clusterArrangement: "spiral",
      showGuideLines: false,
    });

    const result = await page.evaluate(() => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const meta = leaf?.view?.clusterMeta;
      return {
        hasGuideData: !!meta?.guideLineData,
        arrangement: meta?.guideLineData?.arrangement ?? "none",
      };
    });

    // Guide data should still be computed in metadata even when rendering is off
    expect(result.hasGuideData).toBe(true);
    expect(result.arrangement).toBe("spiral");
  });
});
