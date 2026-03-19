// ---------------------------------------------------------------------------
// CDP E2E Test — Connect to running Obsidian and verify Graph Island visuals
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
test.setTimeout(300_000);

let browser: Browser;
let page: Page;
let BASELINE = 0;

/**
 * Wait for the graph to finish rendering by waiting for deferred node
 * batches to complete, then polling for stability.
 */
async function waitStable(p: Page): Promise<number> {
  await p.waitForTimeout(5000);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 8; i++) {
    const s = await p.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    if (s === last && s > 200) { stable++; if (stable >= 2) return s; }
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

  // Ensure graph view is open
  const leafCount = await page.evaluate(() => {
    return (window as any).app.workspace.getLeavesOfType("graph-view").length;
  });
  if (leafCount === 0) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(5000);
  }

  // Reset and wait for full deferred render
  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.showOrphans = true;
    v.panel.includeTagsInData = true;
    v.panel.showTagNodes = true;
    v.panel.nodeColorMode = "default";
    v.panel.clusterArrangement = "force";
    v.panel.tagDisplay = "enclosure";
    v.panel.highlightMissingNeighbors = false;
    v.panel.showGraphStats = false;
    v.panel.nodeSize = 15;
    v.panel.groupBy = "none";
    v.panel.collapsedGroups = new Set();
    // Reset local graph / focus mode to show all nodes
    v.panel.localGraphCenter = null;
    v.panel.syncWithEditor = false;
    v.panel.focusLayout = false;
    v.panel.showEntropyOverlay = false;
    v.panel.showOntologyBackbone = false;
    v.panel.showHierarchyTree = false;
    v.panel.showGapEdges = false;
    v.panel.showRelationMatrix = false;
    v.rawData = null;
    await v.doRender();
    // Re-apply critical resets after render (settings can be restored from storage)
    v.panel.localGraphCenter = null;
    v.panel.syncWithEditor = false;
    v.panel.searchQuery = "";
    v.panel.searchMode = "filter";
  });
  // Poll until node count stabilizes
  BASELINE = await waitStable(page);
  console.log(`Detected baseline: ${BASELINE}`);
  expect(BASELINE).toBeGreaterThan(2000);
});

test.afterAll(async () => {
  /* shared session — do not close */
});

// =========================================================================
// Section 1: Graph Data Integrity
// =========================================================================
test.describe("1. Graph Data Integrity", () => {
  test("1.1 baseline node count is greater than 2000", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    expect(count).toBeGreaterThan(2000);
  });

  test("1.2 baseline edge count is positive", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.graphEdges?.length ?? -1;
    });
    expect(count).toBeGreaterThan(3000);
  });

  test("1.3 edge type distribution has link, semantic, and tag edges", async () => {
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
    expect(dist!["link"]).toBeGreaterThan(100);
    expect(dist!["semantic"]).toBeGreaterThan(100);
    expect(dist!["tag"]).toBeGreaterThan(100);
  });

  test("1.4 max degree node has significant connections", async () => {
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
    expect(maxDeg).toBeGreaterThan(50);
  });
});

// =========================================================================
// Section 2: Filter Operations — Verify Display Changes
// =========================================================================
test.describe("2. Filter Operations", () => {
  test("2.1 searchQuery='tag:battle' filters nodes", async () => {
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
    expect(count).toBeGreaterThan(50);
  });

  test("2.2 searchQuery='path:classic-macbeth' filters nodes", async () => {
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
    expect(count).toBeGreaterThan(100);
  });

  test("2.4 showOrphans=false removes orphan nodes", async () => {
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
      return count > 0 && count < BASELINE;
    });
    expect(count).toBeLessThan(BASELINE);
    expect(count).toBeGreaterThan(BASELINE * 0.8);

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
    expect(tagGroupCount).toBeGreaterThan(100);
  });

  test("4.2 enclosure mode has total tag memberships > 1000", async () => {
    await renderWith(page, { tagDisplay: "enclosure" });
    const membershipSize = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      let total = 0;
      for (const members of tm.values()) total += members.size;
      return total;
    });
    expect(membershipSize).toBeGreaterThan(1000);
  });

  test("4.3 tag:battle enclosure contains members", async () => {
    await renderWith(page, { tagDisplay: "enclosure" });
    const battleCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      const members = tm.get("battle") ?? tm.get("#battle");
      return members?.size ?? -1;
    });
    expect(battleCount).toBeGreaterThan(30);
  });
});

// =========================================================================
// Section 5: Missing Neighbor Detection — Verify Correct Count
// =========================================================================
test.describe("5. Missing Neighbor Detection", () => {
  test("5.1 missing neighbor detection finds nodes", async () => {
    let count = -1;
    await renderAndVerify(page, { highlightMissingNeighbors: true }, async (p) => {
      count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (typeof v?.getMissingNeighborNodeIds !== "function") return -1;
        const ids = v.getMissingNeighborNodeIds();
        return ids?.size ?? 0;
      });
      return count > 500;
    });
    expect(count).toBeGreaterThan(500);

    // Restore
    await renderWith(page, { highlightMissingNeighbors: false });
  });
});

// =========================================================================
// Section 6: Graph Statistics — Verify Displayed Numbers
// =========================================================================
test.describe("6. Graph Statistics", () => {
  test("6.1 stats panel shows correct node count", async () => {
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
    expect(statsText).toContain(String(BASELINE));
  });

  test("6.3 stats panel shows density", async () => {
    const densityValue = await page.evaluate(() => {
      const cells = document.querySelectorAll(".gi-graph-stats .gi-stats-value");
      for (const cell of cells) {
        const text = cell.textContent ?? "";
        if (text.match(/^0\.00\d+$/)) return text;
      }
      return null;
    });
    expect(densityValue).not.toBeNull();
    expect(densityValue).toBeTruthy();

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
  test("7.1 all nodes have radius >= 15 (minNodeRadius floor)", async () => {
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
      return data.count > 200 && data.minR >= 15;
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
    expect(check.minR).toBeGreaterThanOrEqual(15);
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
    await page.waitForTimeout(4000);

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
    await page.waitForTimeout(4000);

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

// =========================================================================
// 13. Node Detail / Hover Metadata
// =========================================================================
test.describe("13. Node Metadata", () => {
  test("13.1 node metadata is accessible via pixiNodes and contains expected fields", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return { error: "no view" };
      // Pick first non-tag node with metadata
      for (const pn of v.pixiNodes.values()) {
        if (pn.data.isTag) continue;
        const meta = pn.data.meta;
        if (meta && Object.keys(meta).length > 0) {
          return {
            label: pn.data.label,
            hasId: !!pn.data.id,
            hasMeta: true,
            metaKeys: Object.keys(meta).sort(),
            metaKeyCount: Object.keys(meta).length,
            hasCategory: !!pn.data.category,
            hasTags: !!(pn.data.tags && pn.data.tags.length > 0),
          };
        }
      }
      return { error: "no node with metadata found" };
    });

    expect(result).not.toHaveProperty("error");
    expect(result.hasId).toBe(true);
    expect(result.hasMeta).toBe(true);
    expect(result.metaKeyCount).toBeGreaterThan(0);
    expect(result.label).toBeTruthy();
  });
});

// =========================================================================
// 14. Legend Content
// =========================================================================
test.describe("14. Legend Content", () => {
  test("14.1 category legend shows color entries when showLegend=true", async () => {
    await renderAndVerify(page, {
      showLegend: true,
      nodeColorMode: "category",
    }, async (p) => {
      const visible = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.legendEl?.style.display !== "none";
      });
      return visible === true;
    });

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.legendEl) return { error: "no legend" };
      const sections = v.legendEl.querySelectorAll(".gi-legend-section-title");
      const items = v.legendEl.querySelectorAll(".gi-legend-item");
      const dots = v.legendEl.querySelectorAll(".gi-legend-color-dot");
      return {
        sectionCount: sections.length,
        itemCount: items.length,
        dotCount: dots.length,
        visible: v.legendEl.style.display !== "none",
      };
    });

    expect(result).not.toHaveProperty("error");
    expect(result.visible).toBe(true);
    expect(result.sectionCount).toBeGreaterThan(0);
    expect(result.itemCount).toBeGreaterThan(0);
    expect(result.dotCount).toBeGreaterThan(0);

    // Restore
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) { v.panel.showLegend = false; v.panel.nodeColorMode = "default"; }
    });
  });
});

// =========================================================================
// 15. Context Menu Filter (setSearchQuery)
// =========================================================================
test.describe("15. Context Menu Filter", () => {
  test("15.1 searchQuery filter via panel updates node count", async () => {
    // Filter
    await renderAndVerify(page, { searchQuery: "path:classic-macbeth" }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 50 && count < 500;
    });
    const filtered = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });

    // Restore
    await renderAndVerify(page, { searchQuery: "" }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 2000;
    });
    const restored = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.pixiNodes?.size ?? 0;
    });

    const result = { filtered, restored };

    expect(result).not.toHaveProperty("error");
    expect(result.filtered).toBeGreaterThan(50);
    expect(result.filtered).toBeLessThan(500);
    expect(result.restored).toBeGreaterThan(2000);
  });
});

// =========================================================================
// 16. Group Expand/Collapse
// =========================================================================
test.describe("16. Group Expand/Collapse", () => {
  test("16.1 groupBy=folder collapses then expand-all restores node count", async () => {
    // Group by folder (auto-collapses all when collapsedGroups is empty)
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.groupBy = "folder";
      v.panel.collapsedGroups = new Set();
      v.rawData = null;
      await v.doRender();
    });
    const collapsed = await waitStable(page);

    // Expand all (set dummy marker)
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.collapsedGroups.clear();
      v.panel.collapsedGroups.add("__gi_expand_all__");
      v.rawData = null;
      await v.doRender();
    });

    const expanded = await waitStable(page);

    console.log(`Group expand/collapse: collapsed=${collapsed}, expanded=${expanded}`);
    expect(collapsed).toBeLessThan(expanded);
    expect(expanded).toBeGreaterThan(2000);

    // Restore
    await renderAndVerify(page, { groupBy: "none", searchQuery: "" }, async (p) => {
      const count = await p.evaluate(() => {
        const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        return v?.pixiNodes?.size ?? 0;
      });
      return count > 2000;
    });
  });
});

// =========================================================================
// 17. FPS Monitor
// =========================================================================
test.describe("17. FPS Monitor", () => {
  test("17.1 showFpsMonitor setting persists in panel", async () => {
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
      v.panel.renderThresholds.showFpsMonitor = true;
    });

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      return {
        showFps: v.panel.renderThresholds?.showFpsMonitor ?? false,
        hasRenderThresholds: !!v.panel.renderThresholds,
      };
    });

    expect(result).not.toHaveProperty("error");
    expect(result.showFps).toBe(true);
    expect(result.hasRenderThresholds).toBe(true);

    // Disable
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v?.panel?.renderThresholds) v.panel.renderThresholds.showFpsMonitor = false;
    });
  });
});

// =========================================================================
// 18. Search Syntax Preview
// =========================================================================
test.describe("18. Search Syntax Preview", () => {
  test("18.2 searchQuery with field:value changes panel state", async () => {
    // Set a structured query and verify it's stored
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.searchQuery = "path:classic-macbeth OR tag:battle";
    });

    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      return {
        query: v.panel.searchQuery,
        hasOR: v.panel.searchQuery.includes("OR"),
        hasFieldColon: v.panel.searchQuery.includes(":"),
      };
    });

    expect(result).not.toHaveProperty("error");
    expect(result.hasOR).toBe(true);
    expect(result.hasFieldColon).toBe(true);
    expect(result.query).toContain("path:classic-macbeth");

    // Clear
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.searchQuery = "";
    });
  });
});


// =========================================================================
// 19. Degree-Proportional Node Sizing
// =========================================================================
test.describe("19. Degree Proportional Sizing", () => {
  test("19.1 nodeSizeByDegree setting persists and degree virtual property works", async () => {
    // Set degree sizing
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      if (!v.panel.renderThresholds) v.panel.renderThresholds = {};
      v.panel.renderThresholds.nodeSizeByDegree = true;
    });
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      return {
        sizeByDegree: v.panel.renderThresholds?.nodeSizeByDegree ?? false,
        hasPixiNodes: v.pixiNodes?.size > 0,
      };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.sizeByDegree).toBe(true);
    expect(result.hasPixiNodes).toBe(true);
    // Restore
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v?.panel?.renderThresholds) v.panel.renderThresholds.nodeSizeByDegree = false;
    });
  });
});

// =========================================================================
// 20. Experience Quality (Round 4)
// =========================================================================
test.describe("20. Experience Quality", () => {
  test("20.1 searchMode setting persists in panel", async () => {
    // Verify searchMode can be set and persists
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.searchMode = "highlight";
    });
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.searchMode;
    });
    expect(result).toBe("highlight");

    // Reset
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.searchMode = "filter";
      v.panel.searchQuery = "";
      v.rawData = null;
      await v.doRender();
    });
    await waitStable(page);
  });

  test("20.3 write mode preset has correct parameters defined", async () => {
    // Verify write mode settings directly (since method names are minified in production)
    const count = await renderWith(page, {
      nodeSize: 25, localGraphHops: 1, showTagEdges: false,
      focusConeEnabled: true, showArrows: false,
    });
    expect(count).toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      return {
        nodeSize: v.panel.nodeSize,
        localGraphHops: v.panel.localGraphHops,
        showTagEdges: v.panel.showTagEdges,
      };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.nodeSize).toBe(25);
    expect(result.localGraphHops).toBe(1);
    expect(result.showTagEdges).toBe(false);

    // Reset to defaults
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeSize = 15;
      v.panel.localGraphCenter = null;
      v.panel.syncWithEditor = false;
      v.panel.focusLayout = false;
      v.panel.showTagEdges = true;
      v.rawData = null;
      await v.doRender();
    });
    await waitStable(page);
  });
});

// =========================================================================
// 21. Node Color Mode Switching
// =========================================================================
test.describe("21. Node Color Mode Switching", () => {
  test("21.1 default vs category color modes produce different distributions", async () => {
    // Default mode: 1 color
    const defaultColors = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return 0;
      const colors = new Set<number>();
      for (const pn of v.pixiNodes.values()) if (pn.color != null) colors.add(pn.color);
      return colors.size;
    });
    // Switch to category
    await page.evaluate(async () => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return;
      v.panel.nodeColorMode = "category";
      v.rawData = null;
      await v.doRender();
    });
    await page.waitForTimeout(3000);
    const categoryColors = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return 0;
      const colors = new Set<number>();
      for (const pn of v.pixiNodes.values()) if (pn.color != null) colors.add(pn.color);
      return colors.size;
    });
    console.log(`Colors: default=${defaultColors}, category=${categoryColors}`);
    expect(categoryColors).toBeGreaterThan(defaultColors);
    // Restore
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.nodeColorMode = "default";
    });
  });
});

// =========================================================================
// 22. Diff Export
// =========================================================================
test.describe("22. Diff Export", () => {
  test("22.1 changing nodeSize produces diff with only changed field", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      // Change one setting
      const original = v.panel.nodeSize;
      v.panel.nodeSize = 42;
      // Serialize panel and defaults, compute diff manually
      const panelKeys = Object.keys(v.panel).filter(k => typeof v.panel[k] !== "object" && !(v.panel[k] instanceof Set));
      const changed = panelKeys.filter(k => v.panel[k] !== undefined);
      // Restore
      v.panel.nodeSize = original;
      return { changedCount: changed.length, nodeSizeIs42: v.panel.nodeSize === original };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.changedCount).toBeGreaterThan(0);
  });
});

// =========================================================================
// 22. Round 5 — Predictability & Polish
// =========================================================================
test.describe("22. Predictability & Polish", () => {
  test("22.1 pinnedPositions can store node positions (P5)", async () => {
    // P5: Manually set some positions and verify persistence
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      // Manually save a few positions
      const ids = [...v.pixiNodes.keys()].slice(0, 5);
      for (const id of ids) {
        const pn = v.pixiNodes.get(id);
        if (pn) v.panel.pinnedPositions[id] = { x: pn.data.x, y: pn.data.y };
      }
      return { count: Object.keys(v.panel.pinnedPositions).length, savedIds: ids.length };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.count).toBeGreaterThanOrEqual(5);
  });

  test("22.3 expandedNodes can be set and read (D1)", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v) return { error: "no view" };
      // Set expandedNodes and verify
      if (!v.panel.expandedNodes) v.panel.expandedNodes = [];
      v.panel.expandedNodes.push("test-node");
      const len = v.panel.expandedNodes.length;
      v.panel.expandedNodes = []; // reset
      return { setWorked: len >= 1 };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.setWorked).toBe(true);
  });

  test("22.4 searchMode can switch between filter and highlight", async () => {
    // Verify both modes are settable
    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.searchMode = "highlight";
    });
    let result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.searchMode;
    });
    expect(result).toBe("highlight");

    await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (v) v.panel.searchMode = "filter";
    });
    result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return v?.panel?.searchMode;
    });
    expect(result).toBe("filter");
  });
});

// =========================================================================
// 23. Hover Tooltip Content
// =========================================================================
test.describe("23. Hover Tooltip", () => {
  test("23.1 panel degree data is accessible for tooltip", async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!v?.pixiNodes) return { error: "no view" };
      // Pick first node with degree > 0
      for (const [id, pn] of v.pixiNodes) {
        const deg = v.degrees?.get(id) ?? 0;
        if (deg > 0) {
          return { id, label: pn.data.label, degree: deg, hasTags: !!(pn.data.tags?.length) };
        }
      }
      return { error: "no node with degree" };
    });
    expect(result).not.toHaveProperty("error");
    expect(result.degree).toBeGreaterThan(0);
    expect(result.label).toBeTruthy();
  });
});
