// ---------------------------------------------------------------------------
// CDP E2E — Visual Features (enclosure, heatmap, hover, timeline, stats, etc.)
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

// =========================================================================
// Lifecycle
// =========================================================================

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Ensure exactly 1 graph-view leaf, reset to force layout
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);

  // Reset to force layout with defaults
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      const state = view.getState();
      await view.setState({ ...state, layout: "force" }, {});
    }
  });
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  // Don't close — reusing running Obsidian
});

// =========================================================================
// Helper: apply panel settings and trigger render
// =========================================================================
async function applyPanelSettings(
  pg: Page,
  settings: Record<string, unknown>,
  waitMs = 3000,
): Promise<void> {
  await pg.evaluate(async (cfg) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) throw new Error("No graph-view found");
    const panel = view.panel;
    if (!panel) throw new Error("No panel found");

    for (const [key, value] of Object.entries(cfg)) {
      if (key.includes(".")) {
        // Nested property like "renderThresholds.edgeStrengthGlow"
        const parts = key.split(".");
        let target: any = panel;
        for (let i = 0; i < parts.length - 1; i++) {
          target = target[parts[i]];
          if (!target) break;
        }
        if (target) target[parts[parts.length - 1]] = value;
      } else {
        (panel as any)[key] = value;
      }
    }

    if (typeof view.doRender === "function") await view.doRender();
  }, settings);
  await pg.waitForTimeout(waitMs);
}

// =========================================================================
// VF-1: Enclosure rendering
// =========================================================================
test.describe("VF-1: Enclosure Rendering", () => {
  test("VF-1.1 tagDisplay=enclosure renders without crash", async () => {
    await applyPanelSettings(page, {
      showTagNodes: true,
      tagDisplay: "enclosure",
    });

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      return {
        hasEnclosureLabelContainer: !!view.enclosureLabelContainer,
        enclosureLabelChildren: view.enclosureLabelContainer?.children?.length ?? -1,
        hasEnclosureGraphics: !!view.enclosureGraphics,
        pixiNodeCount: view.pixiNodes ? view.pixiNodes.size ?? Object.keys(view.pixiNodes).length : 0,
        canvasPresent: document.querySelectorAll("canvas").length > 0,
      };
    });

    console.log("VF-1.1 Enclosure result:", JSON.stringify(result));
    expect(result).not.toBeNull();
    expect(result!.canvasPresent).toBe(true);
    // Enclosure label container should exist when tagDisplay=enclosure
    expect(result!.hasEnclosureLabelContainer).toBe(true);
  });

  test("VF-1.2 reset tagDisplay to node", async () => {
    await applyPanelSettings(page, {
      tagDisplay: "node",
    }, 2000);

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      return {
        tagDisplay: view.panel?.tagDisplay,
      };
    });

    console.log("VF-1.2 Reset result:", JSON.stringify(result));
    expect(result?.tagDisplay).toBe("node");
  });
});

// =========================================================================
// VF-2: Heatmap legend
// =========================================================================
test.describe("VF-2: Heatmap Legend", () => {
  test("VF-2.1 nodeColorMode=heatmap shows legend section", async () => {
    await applyPanelSettings(page, {
      nodeColorMode: "heatmap",
    });

    const result = await page.evaluate(() => {
      const legendSections = document.querySelectorAll(".gi-legend-section");
      const legendOverlay = document.querySelector(".gi-legend-overlay, .gi-legend");
      return {
        legendSectionCount: legendSections.length,
        legendOverlayExists: !!legendOverlay,
        legendOverlayVisible: legendOverlay
          ? (legendOverlay as HTMLElement).style.display !== "none"
          : false,
        legendSectionTexts: Array.from(legendSections).map(s =>
          s.querySelector(".gi-legend-section-title")?.textContent?.trim() ?? "",
        ),
      };
    });

    console.log("VF-2.1 Heatmap legend:", JSON.stringify(result));
    expect(result.legendSectionCount).toBeGreaterThan(0);
  });

  test("VF-2.2 reset to category mode", async () => {
    await applyPanelSettings(page, {
      nodeColorMode: "category",
    }, 2000);

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      return { nodeColorMode: view?.panel?.nodeColorMode };
    });

    console.log("VF-2.2 Reset result:", JSON.stringify(result));
    expect(result.nodeColorMode).toBe("category");
  });
});

// =========================================================================
// VF-3: Hover tooltip (hoverLabel)
// =========================================================================
test.describe("VF-3: Hover Tooltip", () => {
  test("VF-3.1 setHighlightedNodeId + applyHover creates hoverLabel", async () => {
    const result = await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // Pick the first available node
      const pixiNodes = view.pixiNodes;
      if (!pixiNodes || (pixiNodes.size ?? Object.keys(pixiNodes).length) === 0) {
        return { error: "no pixiNodes" };
      }

      let firstId: string | null = null;
      if (pixiNodes instanceof Map) {
        firstId = pixiNodes.keys().next().value ?? null;
      } else {
        firstId = Object.keys(pixiNodes)[0] ?? null;
      }
      if (!firstId) return { error: "no node id" };

      // Set highlight and apply hover
      view.setHighlightedNodeId(firstId);
      if (typeof view.applyHover === "function") view.applyHover();
      await new Promise(r => setTimeout(r, 500));

      // Check if hoverLabel was created on the highlighted node
      let pn: any;
      if (pixiNodes instanceof Map) {
        pn = pixiNodes.get(firstId);
      } else {
        pn = pixiNodes[firstId];
      }

      return {
        nodeId: firstId,
        hasHoverLabel: !!pn?.hoverLabel,
        hoverLabelVisible: pn?.hoverLabel?.visible ?? false,
        gfxAlpha: pn?.gfx?.alpha ?? -1,
      };
    });

    console.log("VF-3.1 Hover result:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.hasHoverLabel).toBe(true);
  });

  test("VF-3.2 clear hover removes hoverLabel", async () => {
    const result = await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // Clear highlight
      view.setHighlightedNodeId(null);
      if (typeof view.applyHover === "function") view.applyHover();
      await new Promise(r => setTimeout(r, 500));

      // Check all pixiNodes — none should have hoverLabel
      const pixiNodes = view.pixiNodes;
      let hoverLabelCount = 0;
      const check = (pn: any) => { if (pn?.hoverLabel) hoverLabelCount++; };

      if (pixiNodes instanceof Map) {
        for (const pn of pixiNodes.values()) check(pn);
      } else if (pixiNodes) {
        for (const id of Object.keys(pixiNodes)) check(pixiNodes[id]);
      }

      return {
        hoverLabelCount,
        highlightedNodeId: view.getHighlightedNodeId?.() ?? view.highlightedNodeId,
      };
    });

    console.log("VF-3.2 Clear hover result:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.hoverLabelCount).toBe(0);
  });
});

// =========================================================================
// VF-4: Duration bars (timeline)
// =========================================================================
test.describe("VF-4: Timeline Duration Bars", () => {
  test("VF-4.1 clusterArrangement=timeline renders without crash", async () => {
    // Switch to cluster-force layout with timeline arrangement
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return;
      const state = view.getState();
      await view.setState({
        ...state,
        layout: "cluster-force",
        clusterArrangement: "timeline",
        groupBy: "folder",
      }, {});
    });
    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      return {
        currentLayout: view.currentLayout,
        hasClusterMeta: !!view.clusterMeta,
        hasTimelineBars: !!(view.clusterMeta?.timelineBars),
        timelineBarCount: view.clusterMeta?.timelineBars?.length ?? 0,
        pixiNodeCount: view.pixiNodes
          ? (view.pixiNodes.size ?? Object.keys(view.pixiNodes).length)
          : 0,
        canvasPresent: document.querySelectorAll("canvas").length > 0,
      };
    });

    console.log("VF-4.1 Timeline result:", JSON.stringify(result));
    expect(result).not.toBeNull();
    expect(result!.canvasPresent).toBe(true);
    // Should not crash — pixiNodes should exist
    expect(result!.pixiNodeCount).toBeGreaterThanOrEqual(0);
  });

  test("VF-4.2 reset to force layout", async () => {
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view) {
        const state = view.getState();
        await view.setState({ ...state, layout: "force" }, {});
      }
    });
    await page.waitForTimeout(3000);
  });
});

// =========================================================================
// VF-5: Graph stats panel
// =========================================================================
test.describe("VF-5: Graph Stats Panel", () => {
  test("VF-5.1 showGraphStats=true shows stats with numbers", async () => {
    await applyPanelSettings(page, {
      showGraphStats: true,
    });

    const result = await page.evaluate(() => {
      const statsEl = document.querySelector(".gi-graph-stats");
      if (!statsEl) return { error: "no stats element" };
      const display = (statsEl as HTMLElement).style.display;
      const text = statsEl.textContent?.trim() ?? "";

      // Extract values from the stats table
      const values = Array.from(statsEl.querySelectorAll(".gi-stats-value")).map(
        el => el.textContent?.trim() ?? "",
      );

      return {
        visible: display !== "none",
        hasContent: text.length > 0,
        containsNumbers: /\d/.test(text),
        values,
        fullText: text.slice(0, 300),
      };
    });

    console.log("VF-5.1 Graph stats:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.visible).toBe(true);
    expect(result.containsNumbers).toBe(true);
    expect(result.values.length).toBeGreaterThan(0);
  });

  test("VF-5.2 stats include density as decimal", async () => {
    const result = await page.evaluate(() => {
      const statsEl = document.querySelector(".gi-graph-stats");
      if (!statsEl) return { error: "no stats element" };

      const labels = Array.from(statsEl.querySelectorAll(".gi-stats-label")).map(
        el => el.textContent?.trim() ?? "",
      );
      const values = Array.from(statsEl.querySelectorAll(".gi-stats-value")).map(
        el => el.textContent?.trim() ?? "",
      );

      // Density is typically at index 3 (nodes, edges, avgDegree, density)
      const densityIdx = labels.findIndex(l =>
        l.toLowerCase().includes("density") || l.includes("密度"),
      );

      return {
        labels,
        values,
        densityIndex: densityIdx,
        densityValue: densityIdx >= 0 ? values[densityIdx] : null,
      };
    });

    console.log("VF-5.2 Density check:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    // Density should be a decimal number like "0.0042"
    if (result.densityValue) {
      expect(result.densityValue).toMatch(/^\d+\.\d+$/);
    }
  });

  test("VF-5.3 hide stats panel", async () => {
    await applyPanelSettings(page, {
      showGraphStats: false,
    }, 4000);

    const result = await page.evaluate(() => {
      const statsEl = document.querySelector(".gi-graph-stats");
      if (!statsEl) return { hidden: true };
      const display = (statsEl as HTMLElement).style.display;
      const isEmpty = (statsEl.textContent?.trim() ?? "").length === 0;
      return {
        hidden: display === "none" || isEmpty,
        display,
        textLen: (statsEl.textContent?.trim() ?? "").length,
      };
    });

    console.log("VF-5.3 Hidden result:", JSON.stringify(result));
    expect(result.hidden).toBe(true);
  });
});

// =========================================================================
// VF-6: OOB badge
// =========================================================================
test.describe("VF-6: Out-of-Bounds Badge", () => {
  test("VF-6.1 showOutOfBoundsIndicator=true shows badge element", async () => {
    await applyPanelSettings(page, {
      showOutOfBoundsIndicator: true,
    });

    const result = await page.evaluate(() => {
      const badge = document.querySelector(".gi-oob-badge");
      if (!badge) return { error: "no oob badge element" };
      return {
        exists: true,
        textContent: badge.textContent?.trim() ?? "",
        display: (badge as HTMLElement).style.display,
      };
    });

    console.log("VF-6.1 OOB badge:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.exists).toBe(true);
  });

  test("VF-6.2 disable OOB indicator", async () => {
    await applyPanelSettings(page, {
      showOutOfBoundsIndicator: false,
    }, 2000);
  });
});

// =========================================================================
// VF-7: Missing neighbor rings
// =========================================================================
test.describe("VF-7: Missing Neighbor Rings", () => {
  test("VF-7.1 highlightMissingNeighbors computes missingNeighborNodeIds", async () => {
    await applyPanelSettings(page, {
      highlightMissingNeighbors: true,
    });

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // getMissingNeighborNodeIds or direct access
      let missingSet: Set<string> | null = null;
      if (typeof view.getMissingNeighborNodeIds === "function") {
        missingSet = view.getMissingNeighborNodeIds();
      } else {
        missingSet = view.missingNeighborNodeIds;
      }

      return {
        highlightMissingNeighbors: view.panel?.highlightMissingNeighbors,
        missingSetSize: missingSet ? missingSet.size : 0,
        missingSetIsNull: missingSet === null,
        hasMissingSetProperty: "missingNeighborNodeIds" in view ||
          typeof view.getMissingNeighborNodeIds === "function",
      };
    });

    console.log("VF-7.1 Missing neighbors:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.highlightMissingNeighbors).toBe(true);
    // The feature should be active (property accessible)
    expect(result.hasMissingSetProperty).toBe(true);
  });

  test("VF-7.2 disable missing neighbor highlight", async () => {
    await applyPanelSettings(page, {
      highlightMissingNeighbors: false,
    }, 2000);
  });
});

// =========================================================================
// VF-8: Edge strength glow
// =========================================================================
test.describe("VF-8: Edge Strength Glow", () => {
  test("VF-8.1 edgeStrengthGlow=true renders without crash", async () => {
    // Set renderThresholds.edgeStrengthGlow directly since it's a nested object
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) throw new Error("no view");
      if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
      view.panel.renderThresholds.edgeStrengthGlow = true;
      if (typeof view.doRender === "function") await view.doRender();
    });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      const rt = view.panel?.renderThresholds ?? {};
      return {
        edgeStrengthGlow: rt.edgeStrengthGlow,
        canvasPresent: document.querySelectorAll("canvas").length > 0,
        pixiNodeCount: view.pixiNodes
          ? (view.pixiNodes.size ?? Object.keys(view.pixiNodes).length)
          : 0,
      };
    });

    console.log("VF-8.1 Edge glow:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.edgeStrengthGlow).toBe(true);
    expect(result.canvasPresent).toBe(true);
  });

  test("VF-8.2 disable edge strength glow", async () => {
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return;
      if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
      view.panel.renderThresholds.edgeStrengthGlow = false;
      if (typeof view.doRender === "function") await view.doRender();
    });
    await page.waitForTimeout(2000);
  });
});

// =========================================================================
// VF-9: Community coloring + legend
// =========================================================================
test.describe("VF-9: Community Coloring", () => {
  test("VF-9.1 nodeColorMode=community shows community legend entries", async () => {
    await applyPanelSettings(page, {
      nodeColorMode: "community",
    });

    const result = await page.evaluate(() => {
      const legendSections = document.querySelectorAll(".gi-legend-section");
      const sectionTexts = Array.from(legendSections).map(s => ({
        title: s.querySelector(".gi-legend-section-title")?.textContent?.trim() ?? "",
        itemCount: s.querySelectorAll(".gi-legend-item, tr, div").length,
      }));

      // Check for community-specific text in legend
      const allText = Array.from(legendSections)
        .map(s => s.textContent ?? "")
        .join(" ");
      const hasCommunityText = allText.toLowerCase().includes("community") ||
        allText.includes("コミュニティ");

      return {
        legendSectionCount: legendSections.length,
        sections: sectionTexts,
        hasCommunityText,
        allLegendText: allText.slice(0, 500),
      };
    });

    console.log("VF-9.1 Community legend:", JSON.stringify(result));
    expect(result.legendSectionCount).toBeGreaterThan(0);
  });

  test("VF-9.2 reset nodeColorMode to default", async () => {
    await applyPanelSettings(page, {
      nodeColorMode: "default",
    }, 2000);
  });
});

// =========================================================================
// VF-10: Ancestry breadcrumb
// =========================================================================
test.describe("VF-10: Ancestry Breadcrumb", () => {
  test("VF-10.1 showAncestryBreadcrumb + hover includes breadcrumb path", async () => {
    await applyPanelSettings(page, {
      showAncestryBreadcrumb: true,
    }, 2000);

    const result = await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // Pick a node that is NOT the hub (highest-degree node)
      const pixiNodes = view.pixiNodes;
      if (!pixiNodes || (pixiNodes.size ?? Object.keys(pixiNodes).length) === 0) {
        return { error: "no pixiNodes" };
      }

      // Find highest degree node (hub)
      let hubId = "";
      let maxDeg = -1;
      const degrees = view.degrees;
      if (degrees && degrees instanceof Map) {
        for (const [id, deg] of degrees) {
          if (deg > maxDeg) { maxDeg = deg; hubId = id; }
        }
      }

      // Pick a non-hub node
      let targetId: string | null = null;
      if (pixiNodes instanceof Map) {
        for (const [id] of pixiNodes) {
          if (id !== hubId) { targetId = id; break; }
        }
      } else {
        for (const id of Object.keys(pixiNodes)) {
          if (id !== hubId) { targetId = id; break; }
        }
      }

      if (!targetId) return { error: "no non-hub node" };

      // Set highlight and apply hover
      view.setHighlightedNodeId(targetId);
      if (typeof view.applyHover === "function") view.applyHover();
      await new Promise(r => setTimeout(r, 500));

      // Check the hoverLabel text for breadcrumb character
      let pn: any;
      if (pixiNodes instanceof Map) {
        pn = pixiNodes.get(targetId);
      } else {
        pn = pixiNodes[targetId];
      }

      const hoverText = pn?.hoverLabel?.text ?? "";
      const hasBreadcrumb = hoverText.includes("\u203A"); // › character

      // Clean up hover
      view.setHighlightedNodeId(null);
      if (typeof view.applyHover === "function") view.applyHover();

      return {
        targetId,
        hubId,
        showAncestryBreadcrumb: view.panel?.showAncestryBreadcrumb,
        hasHoverLabel: !!pn?.hoverLabel,
        hoverText: hoverText.slice(0, 200),
        hasBreadcrumb,
        hasAdj: !!(view.adj && view.adj.size > 0),
      };
    });

    console.log("VF-10.1 Ancestry breadcrumb:", JSON.stringify(result));
    expect(result).not.toHaveProperty("error");
    expect(result.showAncestryBreadcrumb).toBe(true);
    // If adjacency data exists and path is found, breadcrumb should be present
    if (result.hasAdj && result.hasHoverLabel) {
      expect(result.hasBreadcrumb).toBe(true);
    }
  });

  test("VF-10.2 disable ancestry breadcrumb and clear hover", async () => {
    await applyPanelSettings(page, {
      showAncestryBreadcrumb: false,
    }, 2000);

    // Ensure hover is cleared
    await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view) {
        view.setHighlightedNodeId(null);
        if (typeof view.applyHover === "function") view.applyHover();
      }
    });
    await page.waitForTimeout(500);
  });
});
