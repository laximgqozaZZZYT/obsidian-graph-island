// ---------------------------------------------------------------------------
// CDP E2E: GroupBy — reload plugin, set tag:? via panel, verify grouping
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Reload plugin to pick up latest build
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(4000);

  // Ensure graph view is open
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);
});

test("Set tag:? grouping and verify super nodes are created", async () => {
  // Step 1: Reset groupBy and set tag:? via panel API, then doRender
  const result = await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) return { error: "no graph view leaves" };
    const view = leaves[0].view;

    // Clear previous grouping
    view.panel.groupBy = "none";
    view.panel.groupByRules = null;
    view.panel.collapsedGroups.clear();
    view.rawData = null;

    // Set tag:? grouping
    view.panel.groupBy = "tag:?";
    view.panel.groupByRules = [{ field: "tag:?", indent: 0 }];

    return { set: true, groupBy: view.panel.groupBy };
  });
  console.log("[Step 1] Set groupBy:", JSON.stringify(result));

  // Step 2: Trigger full render
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    view.rawData = null;
    if (typeof view.doRender === "function") view.doRender();
  });
  await page.waitForTimeout(5000);

  // Step 3: Check the rendered data
  const afterRender = await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) return { error: "no graph view" };
    const view = leaves[0].view;

    // rawData is the pre-grouping data, result of getGraphData
    // After doRender, the nodes are stored in pixiNodes map
    const pixiNodeCount = view.pixiNodes ? (view.pixiNodes instanceof Map ? view.pixiNodes.size : Object.keys(view.pixiNodes).length) : -1;

    // Check collapsedGroups
    const collapsedGroupsList = view.panel.collapsedGroups instanceof Set
      ? [...view.panel.collapsedGroups]
      : [];

    // Check originalGraphData (set when groupBy is active)
    const origNodeCount = view.originalGraphData?.nodes?.length ?? -1;

    // Check the status text for node count
    const statusEl = document.querySelector(".graph-container .gi-status");
    const statusText = statusEl?.textContent ?? "";

    // Check rendered node count from the header
    const headerText = document.querySelector(".graph-container .gi-graph-title")?.textContent ?? "";

    return {
      groupBy: view.panel.groupBy,
      pixiNodeCount,
      collapsedGroupsCount: collapsedGroupsList.length,
      collapsedGroupsSample: collapsedGroupsList.slice(0, 15),
      origNodeCount,
      statusText,
      headerText,
    };
  });

  console.log("\n=== AFTER RENDER ===");
  console.log(JSON.stringify(afterRender, null, 2));

  // Key assertions
  expect(afterRender.groupBy).toBe("tag:?");
  // If grouping works, collapsedGroups should be populated
  console.log(`\nCollapsed groups: ${afterRender.collapsedGroupsCount}`);
  console.log(`Original nodes: ${afterRender.origNodeCount}`);
  console.log(`Pixi nodes (rendered): ${afterRender.pixiNodeCount}`);

  // If there are tags in the vault, there should be collapsed groups
  if (afterRender.origNodeCount > 0) {
    expect(afterRender.collapsedGroupsCount).toBeGreaterThan(0);
    console.log("\n✓ Grouping is working — super nodes created");
  }
});

test("Verify UI shows tag:? placeholder and suggest anchor", async () => {
  // Open panel
  await page.evaluate(() => {
    const graphView = document.querySelector(".graph-container");
    if (!graphView) return;
    const allClickables = graphView.querySelectorAll("button, .clickable-icon, [aria-label]");
    for (const el of allClickables) {
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const cls = (el as HTMLElement).className || "";
      if (label.includes("設定") || label.includes("Setting") || label.includes("setting") ||
          cls.includes("settings") || cls.includes("gear") || cls.includes("cog") ||
          cls.includes("graph-controls-toggle")) {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // Expand display section
  await page.evaluate(() => {
    const panel = document.querySelector(".graph-controls");
    if (!panel) return;
    const headers = panel.querySelectorAll(".tree-item-self");
    for (const h of headers) {
      const text = h.textContent?.trim() || "";
      if (text.includes("表示") || text.includes("Display")) {
        const treeItem = h.closest(".tree-item");
        if (treeItem?.classList.contains("is-collapsed")) (h as HTMLElement).click();
      }
    }
  });
  await page.waitForTimeout(300);

  // Check the grouping input fields
  const inputState = await page.evaluate(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>(".gi-expr-field");
    const info: any[] = [];
    for (const inp of inputs) {
      info.push({
        value: inp.value,
        placeholder: inp.placeholder,
        hasSuggestAnchor: !!inp.closest(".gi-suggest-anchor"),
      });
    }
    return info;
  });
  console.log("[Inputs]:", JSON.stringify(inputState, null, 2));

  // At least one input should exist (tag:? was set in previous test)
  expect(inputState.length).toBeGreaterThan(0);
  expect(inputState[0].placeholder).toContain("tag:?");
  expect(inputState[0].hasSuggestAnchor).toBe(true);
  // The value should be "tag:?" from the previous test
  expect(inputState[0].value).toBe("tag:?");
});
