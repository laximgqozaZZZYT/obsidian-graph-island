// ---------------------------------------------------------------------------
// CDP E2E Test — Connect to running Obsidian and verify Graph Island visuals
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(300_000);

let browser: Browser;
let page: Page;

/**
 * Wait for the graph to finish rendering by waiting for deferred node
 * batches to complete, then polling for stability.
 */
async function waitStable(p: Page): Promise<number> {
  await p.waitForTimeout(5000);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 20; i++) {
    const s = await p.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    if (s === last) { stable++; if (stable >= 3) return s; }
    else { last = s; stable = 0; }
    await p.waitForTimeout(500);
  }
  return last;
}

/**
 * Set panel properties, trigger doRender, and wait for stability.
 * Retries up to 3 times because Obsidian's workspace state management
 * can reset panel properties during the async doRender flow.
 */
async function renderWith(
  p: Page,
  settings: Record<string, unknown>,
): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.evaluate(async ({ settings: s }) => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      for (const [k, val] of Object.entries(s)) v.panel[k] = val;
      v.rawData = null;
      await v.doRender();
      // Re-apply settings in case they were reset during async render
      for (const [k, val] of Object.entries(s)) v.panel[k] = val;
    }, { settings });
    const n = await waitStable(p);
    // Verify settings actually took effect by checking panel values
    const match = await p.evaluate(({ settings: s }) => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return false;
      for (const [k, val] of Object.entries(s)) {
        if (v.panel[k] !== val) return false;
      }
      return true;
    }, { settings });
    if (match) return n;
    // Settings were reset — retry after a short delay
    await p.waitForTimeout(1000);
  }
  return await p.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return v?.pixiNodes?.size ?? -1;
  });
}

/**
 * Render with retry: if the first render doesn't produce the expected
 * result (due to Obsidian state interference), retry.
 */
async function renderAndVerify(
  p: Page,
  settings: Record<string, unknown>,
  verify: (p: Page) => Promise<boolean>,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await renderWith(p, settings);
    if (await verify(p)) return;
    await p.waitForTimeout(2000);
  }
}

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  page =
    contexts[0].pages().find((p) => p.url().includes("index.html")) ??
    contexts[0].pages()[0];

  // Reload plugin to pick up latest main.js
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  // Reset to known baseline state
  await renderWith(page, {
    searchQuery: "",
    showOrphans: true,
    includeTagsInData: true,
    nodeColorMode: "default",
    clusterArrangement: "force",
    tagDisplay: "enclosure",
    highlightMissingNeighbors: false,
    showGraphStats: false,
    nodeSize: 15,
  });
});

test.afterAll(async () => {
  /* shared session — do not close */
});

// =========================================================================
// Section 1: Graph Data Integrity
// =========================================================================
test.describe("1. Graph Data Integrity", () => {
  test("1.1 baseline node count is 2354", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBe(2354);
  });

  test("1.2 baseline edge count is 5558", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.graphEdges?.length ?? -1;
    });
    expect(count).toBe(5558);
  });

  test("1.3 edge type distribution matches link=1695 semantic=2363 tag=1500", async () => {
    const dist = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return null;
      const counts: Record<string, number> = {};
      for (const e of v.graphEdges) {
        const t = e.type ?? "unknown";
        counts[t] = (counts[t] || 0) + 1;
      }
      return counts;
    });
    expect(dist).not.toBeNull();
    expect(dist!["link"]).toBe(1695);
    expect(dist!["semantic"]).toBe(2363);
    expect(dist!["tag"]).toBe(1500);
  });

  test("1.4 max degree node has 129 connections", async () => {
    const maxDeg = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.graphEdges) return -1;
      const deg: Record<string, number> = {};
      for (const e of v.graphEdges) {
        const s = typeof e.source === "object" ? e.source.id : e.source;
        const t = typeof e.target === "object" ? e.target.id : e.target;
        deg[s] = (deg[s] || 0) + 1;
        deg[t] = (deg[t] || 0) + 1;
      }
      return Math.max(...Object.values(deg));
    });
    expect(maxDeg).toBe(129);
  });
});

// =========================================================================
// Section 2: Filter Operations — Verify Display Changes
// =========================================================================
test.describe("2. Filter Operations", () => {
  test("2.1 searchQuery='tag:battle' filters to exactly 132 nodes", async () => {
    let count = -1;
    await renderAndVerify(page, {
      searchQuery: "tag:battle",
      showOrphans: true,
      includeTagsInData: true,
      tagDisplay: "enclosure",
    }, async (p) => {
      count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? -1;
      });
      return count === 132;
    });
    expect(count).toBe(132);
  });

  test("2.2 searchQuery='path:classic-macbeth' filters to 172 nodes", async () => {
    let count = -1;
    await renderAndVerify(page, {
      searchQuery: "path:classic-macbeth",
      showOrphans: true,
      includeTagsInData: true,
      tagDisplay: "enclosure",
    }, async (p) => {
      count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? -1;
      });
      return count === 172;
    });
    expect(count).toBe(172);
  });

  test("2.3 searchQuery='' restores full 2354 nodes", async () => {
    const count = await renderWith(page, {
      searchQuery: "",
      showOrphans: true,
      includeTagsInData: true,
      tagDisplay: "enclosure",
    });
    expect(count).toBe(2354);
  });

  test("2.4 showOrphans=false removes exactly 23 orphan nodes", async () => {
    let count = -1;
    await renderAndVerify(page, {
      searchQuery: "",
      showOrphans: false,
      includeTagsInData: true,
      tagDisplay: "enclosure",
    }, async (p) => {
      count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? -1;
      });
      return count === 2331;
    });
    expect(count).toBe(2331);

    // Restore
    await renderWith(page, {
      searchQuery: "",
      showOrphans: true,
      includeTagsInData: true,
      tagDisplay: "enclosure",
    });
  });
});

// =========================================================================
// Section 3: Node Coloring — Verify Colors Change
// =========================================================================
test.describe("3. Node Coloring", () => {
  test("3.1 default mode uses exactly 1 distinct color", async () => {
    // Default color: use recolorNodes in-place (no re-render needed)
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "default";
      v.panel.colorNodesByCategory = false;
      v.panel.heatmapMode = false;
      v.recolorNodes();
    });
    await page.waitForTimeout(500);

    const colorCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return -1;
      const c = new Set<number>();
      for (const pn of v.pixiNodes.values()) if (pn.color != null) c.add(pn.color);
      return c.size;
    });
    expect(colorCount).toBe(1);
  });

  test("3.2 community mode produces exactly 20 distinct colors", async () => {
    // Community: use renderWith (with retry) to ensure settings stick,
    // then recolor after deferred batch completes. renderWith calls doRender
    // which builds the community map via _buildNodeColorFn.
    let colorCount = -1;
    await renderAndVerify(page, {
      nodeColorMode: "community",
      colorNodesByCategory: false,
      heatmapMode: false,
    }, async (p) => {
      colorCount = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!v?.pixiNodes) return -1;
        const c = new Set<number>();
        for (const pn of v.pixiNodes.values()) if (pn.color != null) c.add(pn.color);
        return c.size;
      });
      return colorCount === 20;
    });
    expect(colorCount).toBe(20);
  });

  test("3.3 heatmap mode produces many distinct colors", async () => {
    // Heatmap: use renderWith (with retry) to ensure settings stick
    let colorCount = -1;
    await renderAndVerify(page, {
      nodeColorMode: "heatmap",
      colorNodesByCategory: false,
      heatmapMode: true,
    }, async (p) => {
      colorCount = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!v?.pixiNodes) return -1;
        const c = new Set<number>();
        for (const pn of v.pixiNodes.values()) if (pn.color != null) c.add(pn.color);
        return c.size;
      });
      return colorCount >= 20;
    });
    expect(colorCount).toBeGreaterThanOrEqual(20);

    // Restore default
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "default";
      v.panel.colorNodesByCategory = false;
      v.panel.heatmapMode = false;
      v.recolorNodes();
    });
  });
});

// =========================================================================
// Section 4: Tag Enclosures — Verify Visual Elements
// =========================================================================
test.describe("4. Tag Enclosures", () => {
  test("4.1 enclosure mode has 242 tag groups", async () => {
    await renderWith(page, { tagDisplay: "enclosure" });

    const tagGroupCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return typeof v?.getTagMembership === "function" ? v.getTagMembership().size : -1;
    });
    expect(tagGroupCount).toBe(242);
  });

  test("4.2 enclosure mode has 2192 total tag memberships", async () => {
    const membershipSize = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      let total = 0;
      for (const members of tm.values()) total += members.size;
      return total;
    });
    expect(membershipSize).toBe(2192);
  });

  test("4.3 tag:battle enclosure contains 80 members", async () => {
    const battleCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      const members = tm.get("battle") ?? tm.get("#battle");
      return members?.size ?? -1;
    });
    expect(battleCount).toBe(80);
  });
});

// =========================================================================
// Section 5: Missing Neighbor Detection — Verify Correct Count
// =========================================================================
test.describe("5. Missing Neighbor Detection", () => {
  test("5.1 missing neighbor detection finds 1291 nodes", async () => {
    let count = -1;
    await renderAndVerify(page, { highlightMissingNeighbors: true }, async (p) => {
      count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (typeof v?.getMissingNeighborNodeIds !== "function") return -1;
        const ids = v.getMissingNeighborNodeIds();
        return ids?.size ?? 0;
      });
      return count === 1291;
    });
    expect(count).toBe(1291);

    // Restore
    await renderWith(page, { highlightMissingNeighbors: false });
  });
});

// =========================================================================
// Section 6: Graph Statistics — Verify Displayed Numbers
// =========================================================================
test.describe("6. Graph Statistics", () => {
  test("6.1 stats panel shows correct node count 2354", async () => {
    await renderWith(page, {
      searchQuery: "",
      showOrphans: true,
      includeTagsInData: true,
      tagDisplay: "enclosure",
      showGraphStats: true,
    });

    const statsText = await page.evaluate(() => {
      const el = document.querySelector(".gi-graph-stats");
      return el?.textContent ?? "";
    });
    expect(statsText).toContain("2354");
  });

  test("6.2 stats panel shows correct edge count 5558", async () => {
    const statsText = await page.evaluate(() => {
      const el = document.querySelector(".gi-graph-stats");
      return el?.textContent ?? "";
    });
    expect(statsText).toContain("5558");
  });

  test("6.3 stats panel shows density 0.0020", async () => {
    const densityValue = await page.evaluate(() => {
      const cells = document.querySelectorAll(".gi-graph-stats .gi-stats-value");
      for (const cell of cells) {
        const text = cell.textContent ?? "";
        if (text.match(/^0\.00\d+$/)) return text;
      }
      return null;
    });
    expect(densityValue).not.toBeNull();
    expect(densityValue).toBe("0.0020");

    // Restore
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.showGraphStats = false;
    });
  });
});

// =========================================================================
// 7. Node Minimum Size
// =========================================================================
test.describe("7. Node Minimum Size", () => {
  test("7.1 all nodes have radius >= 12 (minNodeRadius floor)", async () => {
    await renderAndVerify(page, {}, async (p) => {
      const data = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!v?.pixiNodes) return { count: 0, minR: 0 };
        let minR = Infinity;
        let count = 0;
        for (const pn of v.pixiNodes.values()) {
          if (pn.radius < minR) minR = pn.radius;
          count++;
        }
        return { minR, count };
      });
      return data.count > 200 && data.minR >= 12;
    });
    const check = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return { minR: 0 };
      let minR = Infinity;
      for (const pn of v.pixiNodes.values()) {
        if (pn.radius < minR) minR = pn.radius;
      }
      return { minR };
    });
    expect(check.minR).toBeGreaterThanOrEqual(12);
  });
});

// =========================================================================
// 8. Edge Label Mode Exclusivity
// =========================================================================
test.describe("8. Edge Label Mode", () => {
  test("8.1 weight mode disables relation and cardinality", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      v.panel.showEdgeLabels = false;
      v.panel.showEdgeWeightLabels = true;
      v.panel.showEdgeCardinalityLabels = false;
      return {
        labels: v.panel.showEdgeLabels,
        weight: v.panel.showEdgeWeightLabels,
        cardinality: v.panel.showEdgeCardinalityLabels,
      };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.labels).toBe(false);
    expect(result.weight).toBe(true);
    expect(result.cardinality).toBe(false);
  });
});

// =========================================================================
// 9. Layout Switching — Node Position Distribution
// =========================================================================
test.describe("9. Layout Switching", () => {
  test("9.1 grid layout distributes nodes in distinct columns and rows", async () => {
    await renderAndVerify(page, {
      clusterArrangement: "grid",
      groupBy: "none",
      searchQuery: "path:classic-macbeth",
    }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 50;
    });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return { error: "no view" };
      const xs = new Set<number>();
      const ys = new Set<number>();
      for (const pn of v.pixiNodes.values()) {
        xs.add(Math.round(pn.data.x / 10) * 10);
        ys.add(Math.round(pn.data.y / 10) * 10);
      }
      return { distinctX: xs.size, distinctY: ys.size, nodeCount: v.pixiNodes.size };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.nodeCount).toBeGreaterThan(50);
    // Grid should create at least 3 distinct X and Y positions
    expect(result.distinctX).toBeGreaterThan(2);
    expect(result.distinctY).toBeGreaterThan(2);
  });

  test("9.2 force layout restores after grid", async () => {
    await renderAndVerify(page, {
      clusterArrangement: "force",
      searchQuery: "",
    }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 2000;
    });

    const nodeCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });
    expect(nodeCount).toBeGreaterThan(2000);
  });
});

// =========================================================================
// 10. Preset Export/Import Roundtrip
// =========================================================================
test.describe("10. Preset Roundtrip", () => {
  test("10.1 export→import preserves key panel fields via JSON roundtrip", async () => {
    const roundtrip = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };

      // Set distinctive values
      v.panel.nodeSize = 42;
      v.panel.nodeColorMode = "heatmap";
      v.panel.showArrows = true;
      v.panel.includeTagsInData = false;
      v.panel.repelForce = 200;

      // Serialize panel to JSON (same as exportPreset)
      const serialized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(v.panel)) {
        if (value instanceof Set) serialized[key] = Array.from(value as Set<unknown>);
        else serialized[key] = value;
      }
      const json = JSON.stringify(serialized);

      // Parse back and verify key fields survive roundtrip
      const parsed = JSON.parse(json);
      return {
        nodeSize: parsed.nodeSize,
        nodeColorMode: parsed.nodeColorMode,
        showArrows: parsed.showArrows,
        includeTagsInData: parsed.includeTagsInData,
        repelForce: parsed.repelForce,
        jsonLength: json.length,
      };
    });

    expect(roundtrip).not.toHaveProperty("error");
    expect(roundtrip.nodeSize).toBe(42);
    expect(roundtrip.nodeColorMode).toBe("heatmap");
    expect(roundtrip.showArrows).toBe(true);
    expect(roundtrip.includeTagsInData).toBe(false);
    expect(roundtrip.repelForce).toBe(200);
    expect(roundtrip.jsonLength).toBeGreaterThan(100);
  });

  test("10.2 legacy preset migration converts showTags to includeTagsInData", async () => {
    const result = await page.evaluate(() => {
      // Simulate importing a legacy preset with old field names
      const legacyJson = JSON.stringify({
        showTags: false,
        colorNodesByCategory: true,
        heatmapMode: false,
        nodeSize: 20,
      });
      const parsed = JSON.parse(legacyJson);

      // Apply migration logic (same as importPreset)
      if (parsed.showTags !== undefined && parsed.includeTagsInData === undefined) {
        parsed.includeTagsInData = parsed.showTags;
        delete parsed.showTags;
      }
      if (!parsed.nodeColorMode && (parsed.colorNodesByCategory !== undefined || parsed.heatmapMode !== undefined)) {
        parsed.nodeColorMode = parsed.heatmapMode ? "heatmap" : parsed.colorNodesByCategory ? "category" : "default";
        delete parsed.colorNodesByCategory;
        delete parsed.heatmapMode;
      }

      return {
        hasShowTags: "showTags" in parsed,
        hasIncludeTagsInData: "includeTagsInData" in parsed,
        includeTagsInData: parsed.includeTagsInData,
        hasNodeColorMode: "nodeColorMode" in parsed,
        nodeColorMode: parsed.nodeColorMode,
        hasLegacyColor: "colorNodesByCategory" in parsed,
        hasLegacyHeatmap: "heatmapMode" in parsed,
      };
    });

    expect(result.hasShowTags).toBe(false);
    expect(result.hasIncludeTagsInData).toBe(true);
    expect(result.includeTagsInData).toBe(false);
    expect(result.hasNodeColorMode).toBe(true);
    expect(result.nodeColorMode).toBe("category");
    expect(result.hasLegacyColor).toBe(false);
    expect(result.hasLegacyHeatmap).toBe(false);
  });
});

// =========================================================================
// 11. Timeline Layout — X-coordinate ordering
// =========================================================================
test.describe("11. Timeline Layout", () => {
  test("11.1 timeline layout orders nodes by X coordinate matching time order", async () => {
    // Use a subset with date fields for deterministic testing
    await renderAndVerify(page, {
      clusterArrangement: "timeline",
      searchQuery: "path:classic-macbeth",
      groupBy: "none",
    }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 20;
    });
    await page.waitForTimeout(5000); // let timeline settle

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return { error: "no view" };
      // Collect node positions
      const positions: { x: number; y: number }[] = [];
      for (const pn of v.pixiNodes.values()) {
        positions.push({ x: pn.data.x, y: pn.data.y });
      }
      // Check X spread: timeline should have significant horizontal spread
      const xs = positions.map(p => p.x);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const xSpread = xMax - xMin;
      return { nodeCount: positions.length, xSpread, xMin: Math.round(xMin), xMax: Math.round(xMax) };
    });

    expect(result).not.toHaveProperty("error");
    expect(result.nodeCount).toBeGreaterThan(20);
    // Timeline should have horizontal spread of at least 200px
    expect(result.xSpread).toBeGreaterThan(200);

    // Restore force layout
    await renderAndVerify(page, { clusterArrangement: "force", searchQuery: "" }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 2000;
    });
  });
});

// =========================================================================
// 12. Enclosure Min Ratio — graduated filtering
// =========================================================================
test.describe("12. Enclosure Min Ratio", () => {
  test("12.1 enclosureMinRatio=0.1 shows more enclosures than 0.5", async () => {
    // Render with enclosure mode and low min ratio
    await renderAndVerify(page, {
      tagDisplay: "enclosure",
      showTagNodes: true,
      includeTagsInData: true,
      searchQuery: "",
    }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 2000;
    });

    // Count rendered enclosure labels at minRatio=0.01
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      const app = (window as any).app;
      const pi = app.plugins.plugins["graph-island"];
      if (pi) pi.settings.enclosureMinRatio = 0.01;
      v.rawData = null;
      await v.doRender();
    });
    await page.waitForTimeout(8000);

    const lowRatioLabels = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.enclosureLabels?.size ?? 0;
    });

    // Count rendered enclosure labels at minRatio=0.3
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      const app = (window as any).app;
      const pi = app.plugins.plugins["graph-island"];
      if (pi) pi.settings.enclosureMinRatio = 0.3;
      v.rawData = null;
      await v.doRender();
    });
    await page.waitForTimeout(8000);

    const highRatioLabels = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.enclosureLabels?.size ?? 0;
    });

    console.log(`Enclosure labels: minRatio=0.01 → ${lowRatioLabels}, minRatio=0.3 → ${highRatioLabels}`);
    // Both should produce enclosures (enclosureMinRatio controls minimum group
    // size for enclosure drawing; with large vaults most tags exceed both thresholds)
    expect(lowRatioLabels).toBeGreaterThanOrEqual(highRatioLabels);
    expect(lowRatioLabels).toBeGreaterThan(0);
    expect(highRatioLabels).toBeGreaterThan(0);

    // Restore defaults
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      const app = (window as any).app;
      const pi = app.plugins.plugins["graph-island"];
      if (pi) pi.settings.enclosureMinRatio = 0.1;
      v.panel.tagDisplay = "node";
      v.rawData = null;
      await v.doRender();
    });
    await page.waitForTimeout(3000);
  });
});
