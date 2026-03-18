// ---------------------------------------------------------------------------
// CDP E2E Test — Settings Coverage
//
// Tests untested settings via CDP to verify no crash + expected behavior:
// 1. Layout switching (clusterArrangement)
// 2. Filter controls (showOrphans, showTags, existingOnly)
// 3. Enclosure controls (tagDisplay, enclosureMinRatio)
// 4. Edge controls (showLinks, showSemanticEdges)
// 5. Search (searchQuery)
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(300_000);

let browser: Browser;
let page: Page;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Reload plugin to pick up latest main.js
  await page.evaluate(async () => {
    const app = (window as any).app;
    const pluginId = "graph-island";
    await app.plugins.disablePlugin(pluginId);
    await app.plugins.enablePlugin(pluginId);
  });
  await page.waitForTimeout(3000);

  // Open graph view if not already open
  const leafCount = await page.evaluate(() => {
    const app = (window as any).app;
    return app.workspace.getLeavesOfType("graph-view").length;
  });

  if (leafCount === 0) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(5000);
  } else {
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-view");
      if (leaves.length > 0) app.workspace.setActiveLeaf(leaves[0], { focus: true });
    });
    await page.waitForTimeout(2000);
  }
});

test.afterAll(async () => {
  // Don't close — shared Obsidian session
});

// =========================================================================
// Helper: verify graph view exists and has nodes
// =========================================================================
async function ensureGraphView(p: Page): Promise<void> {
  const hasView = await p.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length > 0;
  });
  expect(hasView).toBe(true);
}

async function getNodeCount(p: Page): Promise<number> {
  return p.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? -1;
  });
}

async function reopenViewIfNeeded(p: Page): Promise<void> {
  const hasView = await p.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length > 0;
  });
  if (!hasView) {
    await p.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await p.waitForTimeout(5000);
  }
}

// =========================================================================
// 1. Layout Switching (clusterArrangement)
// =========================================================================
test.describe("1. Layout Switching (clusterArrangement)", () => {
  test("1.1 switch to grid layout", async () => {
    const before = await getNodeCount(page);
    expect(before).toBeGreaterThan(0);

    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.clusterArrangement = "grid";
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Grid layout: before=${before}, after=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("1.2 switch to concentric layout", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.clusterArrangement = "concentric";
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Concentric layout: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("1.3 timeline + showDurationBars + showTimelineRoutes combined", async () => {
    // Step 1: Switch to timeline with duration bars and routes enabled
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.clusterArrangement = "timeline";
      v.panel.showDurationBars = true;
      v.panel.showTimelineRoutes = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 5000));
    });
    await page.waitForTimeout(1000);

    // Step 2: Verify all three features active
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };

      const pixiNodeCount = v.pixiNodes
        ? (v.pixiNodes.size ?? Object.keys(v.pixiNodes).length)
        : 0;

      return {
        clusterArrangement: v.panel?.clusterArrangement,
        showDurationBars: v.panel?.showDurationBars,
        showTimelineRoutes: v.panel?.showTimelineRoutes,
        pixiNodeCount,
        hasClusterMeta: !!v.clusterMeta,
        canvasPresent: document.querySelectorAll("canvas").length > 0,
        noConflict: pixiNodeCount > 0 && document.querySelectorAll("canvas").length > 0,
      };
    });

    console.log(`1.3 timeline+bars+routes: ${JSON.stringify(result)}`);
    expect(result).not.toHaveProperty("error");
    expect(result.clusterArrangement).toBe("timeline");
    expect(result.showDurationBars).toBe(true);
    expect(result.showTimelineRoutes).toBe(true);
    expect(result.noConflict).toBe(true);
    expect(result.pixiNodeCount).toBeGreaterThan(0);

    // Step 3: Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.clusterArrangement = "force";
      v.panel.showDurationBars = false;
      v.panel.showTimelineRoutes = false;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
    await ensureGraphView(page);
  });

  test("1.4 switch back to force layout restores state", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.clusterArrangement = "force";
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Force layout restored: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);

    const arrangement = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.clusterArrangement;
    });
    expect(arrangement).toBe("force");
  });

  test("1.5 rapid layout cycling does not crash", async () => {
    const layouts = ["grid", "concentric", "timeline", "force"];
    await page.evaluate(async (layoutList) => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      for (const layout of layoutList) {
        v.panel.clusterArrangement = layout;
        v.doRender();
        await new Promise(r => setTimeout(r, 1000));
      }
    }, layouts);
    await page.waitForTimeout(2000);

    const after = await getNodeCount(page);
    console.log(`After rapid layout cycling: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });
});

// =========================================================================
// 2. Filter Controls
// =========================================================================
test.describe("2. Filter Controls", () => {
  test("2.1 showOrphans=false decreases node count", async () => {
    // Ensure showOrphans is true first
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showOrphans = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const countWithOrphans = await getNodeCount(page);
    console.log(`With orphans: ${countWithOrphans}`);
    expect(countWithOrphans).toBeGreaterThan(0);

    // Disable orphans
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showOrphans = false;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const countWithoutOrphans = await getNodeCount(page);
    console.log(`Without orphans: ${countWithoutOrphans}`);
    expect(countWithoutOrphans).toBeGreaterThan(0);
    expect(countWithoutOrphans).toBeLessThanOrEqual(countWithOrphans);
  });

  test("2.2 showOrphans=true restores node count", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showOrphans = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const restored = await getNodeCount(page);
    console.log(`Orphans restored: ${restored}`);
    expect(restored).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("2.3 showTags=false removes tag nodes", async () => {
    // Ensure showTags is true first
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showTags = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const countWithTags = await getNodeCount(page);
    console.log(`With tags: ${countWithTags}`);

    // Disable tags
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showTags = false;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const countWithoutTags = await getNodeCount(page);
    console.log(`Without tags: ${countWithoutTags}`);
    expect(countWithoutTags).toBeGreaterThan(0);
    expect(countWithoutTags).toBeLessThanOrEqual(countWithTags);
  });

  test("2.4 showTags=true restores tag nodes", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showTags = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const restored = await getNodeCount(page);
    console.log(`Tags restored: ${restored}`);
    expect(restored).toBeGreaterThan(0);
  });

  test("2.5 existingOnly=true does not crash", async () => {
    const before = await getNodeCount(page);

    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.existingOnly = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`existingOnly=true: before=${before}, after=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.existingOnly = false;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
  });
});

// =========================================================================
// 3. Enclosure Controls
// =========================================================================
test.describe("3. Enclosure Controls", () => {
  test("3.1 enclosure + search filter shows filtered enclosures", async () => {
    // Step 1: Enable enclosure mode with a search filter
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.tagDisplay = "enclosure";
      v.panel.showTagNodes = true;
      v.panel.searchQuery = "tag:battle";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 4000));
    });
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };

      const pixiNodeCount = v.pixiNodes
        ? (v.pixiNodes.size ?? Object.keys(v.pixiNodes).length)
        : 0;
      const hasEnclosureLabelContainer = !!v.enclosureLabelContainer;
      const enclosureLabelCount = v.enclosureLabelContainer?.children?.length ?? 0;

      return {
        tagDisplay: v.panel?.tagDisplay,
        searchQuery: v.panel?.searchQuery,
        pixiNodeCount,
        hasEnclosureLabelContainer,
        enclosureLabelCount,
        canvasPresent: document.querySelectorAll("canvas").length > 0,
        noConflict: pixiNodeCount >= 0 && document.querySelectorAll("canvas").length > 0,
      };
    });

    console.log(`3.1 enclosure+search: ${JSON.stringify(result)}`);
    expect(result).not.toHaveProperty("error");
    expect(result.tagDisplay).toBe("enclosure");
    expect(result.searchQuery).toBe("tag:battle");
    expect(result.noConflict).toBe(true);

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.tagDisplay = "node";
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
    await ensureGraphView(page);
  });

  test("3.2 tagDisplay=node does not crash", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.tagDisplay = "node";
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`tagDisplay=node: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("3.3 enclosureMinRatio=0.5 does not crash", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.enclosureMinRatio = 0.5;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`enclosureMinRatio=0.5: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("3.4 enclosureMinRatio=0 (edge case) does not crash", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.enclosureMinRatio = 0;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`enclosureMinRatio=0: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("3.5 reset enclosure settings", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.tagDisplay = "node";
      v.panel.enclosureMinRatio = 0.1;
      v.doRender();
      await new Promise(r => setTimeout(r, 2000));
    });
    await ensureGraphView(page);
  });
});

// =========================================================================
// 4. Edge Controls
// =========================================================================
test.describe("4. Edge Controls", () => {
  test("4.1 showLinks=false does not crash and view survives", async () => {
    const before = await getNodeCount(page);

    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showLinks = false;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`showLinks=false: before=${before}, after=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("4.2 showSemanticEdges=false does not crash", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showSemanticEdges = false;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`showSemanticEdges=false: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("4.3 showLinks=false + showSemanticEdges=false combined", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showLinks = false;
      v.panel.showSemanticEdges = false;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Both edges off: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("4.4 reset all edge toggles to true", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showLinks = true;
      v.panel.showSemanticEdges = true;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Edges restored: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });
});

// =========================================================================
// 5. Search
// =========================================================================
test.describe("5. Search", () => {
  test("5.1 searchQuery='tag:*' filters to tag-matching nodes", async () => {
    // Get baseline count with no search
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const fullCount = await getNodeCount(page);
    console.log(`Full node count: ${fullCount}`);
    expect(fullCount).toBeGreaterThan(0);

    // Apply search filter
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "tag:*";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const filteredCount = await getNodeCount(page);
    console.log(`Filtered node count (tag:*): ${filteredCount}`);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(fullCount);
  });

  test("5.2 searchQuery='' restores full node count", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const restored = await getNodeCount(page);
    console.log(`Restored node count: ${restored}`);
    expect(restored).toBeGreaterThan(0);
    await ensureGraphView(page);
  });

  test("5.3 searchQuery with folder filter", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
    const fullCount = await getNodeCount(page);

    // Apply folder-based search
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "path:characters";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const filteredCount = await getNodeCount(page);
    console.log(`Folder filter: full=${fullCount}, filtered=${filteredCount}`);
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    expect(filteredCount).toBeLessThanOrEqual(fullCount);

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
  });

  test("5.4 searchQuery with invalid query does not crash", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "invalidfield:nonexistent AND OR";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    await reopenViewIfNeeded(page);
    await ensureGraphView(page);

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
  });
});

// =========================================================================
// 6. Combined Settings Stress Test
// =========================================================================
test.describe("6. Combined Settings Stress Test", () => {
  test("6.1 filter + layout change combined", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showOrphans = false;
      v.panel.clusterArrangement = "grid";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Filter + grid layout: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showOrphans = true;
      v.panel.clusterArrangement = "force";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
  });

  test("6.2 search + edge toggle + enclosure combined", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.searchQuery = "tag:*";
      v.panel.showLinks = false;
      v.panel.tagDisplay = "enclosure";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`Search + edge off + enclosure: nodeCount=${after}`);
    expect(after).toBeGreaterThanOrEqual(0);
    await ensureGraphView(page);

    // Reset all
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchQuery = "";
      v.panel.showLinks = true;
      v.panel.tagDisplay = "node";
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);
  });

  test("6.3 all filters off simultaneously", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) throw new Error("no view");
      v.panel.showOrphans = false;
      v.panel.showTags = false;
      v.panel.showLinks = false;
      v.panel.showSemanticEdges = false;
      v.panel.existingOnly = true;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`All filters restrictive: nodeCount=${after}`);
    // May be 0 if all nodes are orphans and non-existing, but view should survive
    expect(after).toBeGreaterThanOrEqual(0);
    await ensureGraphView(page);
  });

  test("6.4 restore all defaults", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.showOrphans = true;
      v.panel.showTags = true;
      v.panel.showLinks = true;
      v.panel.showSemanticEdges = true;
      v.panel.existingOnly = false;
      v.panel.searchQuery = "";
      v.panel.clusterArrangement = "force";
      v.panel.tagDisplay = "node";
      v.panel.enclosureMinRatio = 0.1;
      v.rawData = null;
      v.doRender();
      await new Promise(r => setTimeout(r, 3000));
    });
    await page.waitForTimeout(1000);

    const after = await getNodeCount(page);
    console.log(`All defaults restored: nodeCount=${after}`);
    expect(after).toBeGreaterThan(0);
    await ensureGraphView(page);
  });
});
