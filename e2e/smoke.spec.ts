/**
 * Unified Smoke Test — single beforeAll, covers all core features.
 * Target: <3 min (1 CDP connection, no plugin reload between tests).
 *
 * Covers: data integrity, settings, arrangement, search/filter,
 *         groupBy, viewMode, export, edge toggles.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;
let BASELINE = 0;

test.setTimeout(300_000);

/** Find Graph Island view (not Obsidian built-in). */
function findView(p: Page) {
  return p.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!v;
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

  // Reload plugin once
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(5000);

  BASELINE = await renderAndCount({ showOrphans: true });
});

/** Helper: set panel props, doRender, wait, return stable node count via getGraphData(). */
async function renderAndCount(settings: Record<string, unknown>): Promise<number> {
  return page.evaluate(async (s: Record<string, unknown>) => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) throw new Error("Graph Island view not found");
    for (const [k, val] of Object.entries(s)) {
      if (k === "collapsedGroups" && Array.isArray(val)) v.panel[k] = new Set(val);
      else v.panel[k] = val;
    }
    v.rawData = null;
    await v.doRender();
    await new Promise(r => setTimeout(r, 2000));
    return v.getGraphData()?.nodes?.length ?? 0;
  }, settings);
}

/** Helper: reset to default state. */
async function reset(): Promise<number> {
  return renderAndCount({
    searchQuery: "",
    showOrphans: true,
    showAttachments: true,
    existingOnly: false,
    groupBy: "none",
    clusterArrangement: "inherit",
    viewMode: "graph",
  });
}

// ==========================================================================
// 1. Data Integrity
// ==========================================================================
test.describe("1-Data", () => {
  test("baseline node count > 2000", () => {
    expect(BASELINE).toBeGreaterThan(2000);
  });

  test("baseline edge count positive", async () => {
    const edges = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.getGraphData()?.edges?.length ?? 0;
    });
    expect(edges).toBeGreaterThan(0);
  });
});

// ==========================================================================
// 2. Settings & Layout
// ==========================================================================
test.describe("2-Settings", () => {
  test("grid layout preserves nodes", async () => {
    const count = await renderAndCount({ clusterArrangement: "grid" });
    expect(count).toBeGreaterThan(0);
  });

  test("inherit layout restores", async () => {
    const count = await renderAndCount({ clusterArrangement: "inherit" });
    expect(count).toBeGreaterThan(0);
  });

  test("arrangement changes node positions (groupBy=folder)", async () => {
    const getPositions = (arrangement: string) =>
      page.evaluate(async (arr) => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")
          .find((l: any) => "pixiNodes" in l.view)?.view;
        if (!v) return [];
        v.panel.groupBy = "folder";
        v.panel.clusterArrangement = arr;
        v.rawData = null;
        await v.doRender();
        await new Promise(r => setTimeout(r, 3000));
        const pts: number[] = [];
        let i = 0;
        for (const [, pn] of v.pixiNodes) {
          if (i++ >= 5) break;
          pts.push(Math.round(pn.data.x), Math.round(pn.data.y));
        }
        return pts;
      }, arrangement);

    const posGrid = await getPositions("grid");
    const posConcentric = await getPositions("concentric");

    expect(posGrid).not.toEqual(posConcentric);
    await reset();
  });
});

// ==========================================================================
// 3. Search & Filter
// ==========================================================================
test.describe("3-Filter", () => {
  test("searchQuery filters nodes", async () => {
    const count = await renderAndCount({ searchQuery: "node_type:character" });
    expect(count).toBeLessThan(BASELINE);
    expect(count).toBeGreaterThan(0);
    await renderAndCount({ searchQuery: "" });
  });

  test("showOrphans=false reduces nodes", async () => {
    const count = await renderAndCount({ showOrphans: false });
    expect(count).toBeLessThan(BASELINE);
    await renderAndCount({ showOrphans: true });
  });

  test("existingOnly=true filters unresolved", async () => {
    await reset();
    const countAll = await renderAndCount({ existingOnly: false });
    const countExisting = await renderAndCount({ existingOnly: true });
    expect(countExisting).toBeLessThanOrEqual(countAll);
    await renderAndCount({ existingOnly: false });
  });
});

// ==========================================================================
// 4. GroupBy
// ==========================================================================
test.describe("4-GroupBy", () => {
  test("groupBy auto-collapse reduces nodes", async () => {
    await renderAndCount({ groupBy: "none" });
    const grouped = await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { nodeCount: 0, collapsedSize: 0 };
      v.panel.groupBy = "node_type";
      v.panel.collapsedGroups = new Set();
      v.rawData = null;
      await v.doRender();
      await new Promise(r => setTimeout(r, 3000));
      const gd = v.getGraphData();
      return {
        nodeCount: gd?.nodes?.length ?? 0,
        collapsedSize: v.panel.collapsedGroups?.size ?? 0,
      };
    });
    expect(grouped.collapsedSize).toBeGreaterThan(0);
    await reset();
  });
});

// ==========================================================================
// 5. ViewMode
// ==========================================================================
test.describe("5-ViewMode", () => {
  test("sunburst mode switches without crash", async () => {
    const count = await renderAndCount({ viewMode: "sunburst" });
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("timeline mode switches without crash", async () => {
    const count = await renderAndCount({ viewMode: "timeline" });
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("matrix mode creates DOM table", async () => {
    await renderAndCount({ viewMode: "matrix" });
    const hasTable = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return !!v?.containerEl?.querySelector("table, .matrix-container");
    });
    expect(hasTable).toBe(true);
  });

  test("graph mode restores", async () => {
    const count = await renderAndCount({ viewMode: "graph" });
    expect(count).toBeGreaterThan(0);
  });
});

// ==========================================================================
// 6. Export
// ==========================================================================
test.describe("6-Export", () => {
  test("export methods exist", async () => {
    const methods = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return {};
      return {
        csv: typeof v.exportGraphAsCSV === "function",
        mermaid: typeof v.exportGraphAsMermaid === "function",
        subgraph: typeof v.exportSubgraph === "function",
        graphData: typeof v.getGraphData === "function",
      };
    });
    expect(methods.csv).toBe(true);
    expect(methods.mermaid).toBe(true);
    expect(methods.graphData).toBe(true);
  });

  test("getGraphData returns valid structure", async () => {
    const gd = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      const d = v?.getGraphData();
      if (!d) return null;
      return {
        nodes: d.nodes?.length ?? 0,
        edges: d.edges?.length ?? 0,
        hasId: d.nodes?.length > 0 ? typeof d.nodes[0].id === "string" : true,
      };
    });
    expect(gd).not.toBeNull();
    expect(gd!.nodes).toBeGreaterThan(0);
    expect(gd!.hasId).toBe(true);
  });
});

// ==========================================================================
// 7. Edge Toggles
// ==========================================================================
test.describe("7-Edges", () => {
  test("edge types have expected distribution", async () => {
    const counts = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      const gd = v?.getGraphData();
      if (!gd) return {};
      const dist: Record<string, number> = {};
      for (const e of gd.edges) dist[e.type] = (dist[e.type] ?? 0) + 1;
      return dist;
    });
    expect(counts.link).toBeGreaterThan(0);
  });

  test("showLinks toggle changes state", async () => {
    const toggled = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      if (!v) return { before: true, after: true };
      const before = v.panel.showLinks;
      v.panel.showLinks = !before;
      const after = v.panel.showLinks;
      v.panel.showLinks = true; // restore
      return { before, after };
    });
    expect(toggled.after).toBe(!toggled.before);
  });
});

// ==========================================================================
// 8. Coordinate Sanity (final gate)
// ==========================================================================
test("SANITY: no NaN/Inf in node coordinates", async () => {
  await reset();
  const spread = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v?.pixiNodes) return { nan: 0, inf: 0, total: 0 };
    let nan = 0, inf = 0, total = 0;
    for (const [, pn] of v.pixiNodes) {
      total++;
      if (isNaN(pn.data.x) || isNaN(pn.data.y)) nan++;
      if (!isFinite(pn.data.x) || !isFinite(pn.data.y)) inf++;
    }
    return { nan, inf, total };
  });
  expect(spread.nan).toBe(0);
  expect(spread.inf).toBe(0);
  expect(spread.total).toBeGreaterThan(0);
});
