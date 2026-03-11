// ---------------------------------------------------------------------------
// CDP E2E — Verify autoFit eliminates group/node overlap quantitatively
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");

let browser: Browser;
let page: Page;

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

  await p.evaluate(() => {
    const btn = document.querySelector(".graph-settings-btn.is-active");
    if (btn) (btn as HTMLElement).click();
  });
  await p.waitForTimeout(200);
}

/**
 * Measure overlap metrics from live graph state.
 * Returns:
 *   - groupOverlapCount: number of group BBox pair overlaps
 *   - groupOverlapArea: total overlap area (px²)
 *   - nodeOverlapCount: number of node pairs closer than 2×nodeRadius
 *   - nodeCount: total visible nodes
 *   - groupCount: total groups
 */
async function measureOverlaps(p: Page): Promise<{
  groupOverlapCount: number;
  groupOverlapArea: number;
  nodeOverlapCount: number;
  nodeCount: number;
  groupCount: number;
  nodePositions: { id: string; x: number; y: number; group: string }[];
}> {
  return p.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) throw new Error("No graph-view found");
    const view = leaf.view;

    // Access internal pixiNodes and clusterMeta
    const pixiNodes: Map<string, any> = (view as any).pixiNodes;
    const clusterMeta: any = (view as any).clusterMeta;
    const panel = (view as any).panel;
    const nodeSize = panel?.nodeSize ?? 8;

    if (!pixiNodes || pixiNodes.size === 0) {
      return { groupOverlapCount: 0, groupOverlapArea: 0, nodeOverlapCount: 0, nodeCount: 0, groupCount: 0, nodePositions: [] };
    }

    // Collect node positions with cluster assignments
    const nodePositions: { id: string; x: number; y: number; radius: number; group: string }[] = [];
    for (const [id, pn] of pixiNodes) {
      const group = clusterMeta?.nodeClusterMap?.get(id) ?? "__none__";
      nodePositions.push({
        id,
        x: pn.data.x,
        y: pn.data.y,
        radius: pn.radius ?? nodeSize,
        group,
      });
    }

    // Build group BBoxes
    const groupNodes = new Map<string, typeof nodePositions>();
    for (const np of nodePositions) {
      if (!groupNodes.has(np.group)) groupNodes.set(np.group, []);
      groupNodes.get(np.group)!.push(np);
    }

    const padding = nodeSize * 2;
    type BBox = { minX: number; minY: number; maxX: number; maxY: number };
    const groupBBoxes = new Map<string, BBox>();
    for (const [key, members] of groupNodes) {
      if (members.length === 0) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const m of members) {
        if (m.x < minX) minX = m.x;
        if (m.y < minY) minY = m.y;
        if (m.x > maxX) maxX = m.x;
        if (m.y > maxY) maxY = m.y;
      }
      groupBBoxes.set(key, {
        minX: minX - padding, minY: minY - padding,
        maxX: maxX + padding, maxY: maxY + padding,
      });
    }

    // Measure group overlap
    let groupOverlapCount = 0;
    let groupOverlapArea = 0;
    const keys = [...groupBBoxes.keys()].filter(k => k !== "__none__");
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = groupBBoxes.get(keys[i])!;
        const b = groupBBoxes.get(keys[j])!;
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (overlapX > 0 && overlapY > 0) {
          groupOverlapCount++;
          groupOverlapArea += overlapX * overlapY;
        }
      }
    }

    // Measure node-level overlap (pairs closer than 2×radius)
    let nodeOverlapCount = 0;
    for (let i = 0; i < nodePositions.length; i++) {
      for (let j = i + 1; j < nodePositions.length; j++) {
        const a = nodePositions[i];
        const b = nodePositions[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (a.radius + b.radius) * 1.2;
        if (dist < minDist) {
          nodeOverlapCount++;
        }
      }
    }

    return {
      groupOverlapCount,
      groupOverlapArea: Math.round(groupOverlapArea),
      nodeOverlapCount,
      nodeCount: nodePositions.length,
      groupCount: keys.length,
      nodePositions: nodePositions.map(n => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), group: n.group })),
    };
  });
}

/**
 * Apply a preset with given autoFit value and wait for layout to settle.
 */
async function applyPresetWithAutoFit(p: Page, presetObj: any, autoFit: boolean) {
  await p.evaluate(async ({ preset, autoFit }: { preset: any; autoFit: boolean }) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) throw new Error("No graph-view found");
    const view = leaf.view;
    const current = view.getState();

    const { layout, ...panelFields } = preset;
    const newState = {
      ...current,
      layout: layout || current.layout,
      panel: {
        ...current.panel,
        ...panelFields,
        autoFit,
        collapsedGroups: [],
      },
    };
    await view.setState(newState, {});
  }, { preset: presetObj, autoFit });

  // Wait for simulation to settle
  await p.waitForTimeout(8000);
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

// Presets with cluster group rules that produce multiple groups
const testCases = [
  { name: "07-tag-taxonomy", description: "tag-based grouping" },
  { name: "18-folder-compare", description: "folder-based grouping" },
  { name: "06-sangokushi-factions", description: "faction grouping" },
];

test.describe("Auto-fit Overlap Elimination", () => {
  for (const tc of testCases) {
    test(`${tc.name}: autoFit reduces overlap (${tc.description})`, async () => {
      const jsonPath = path.join(SAMPLES_DIR, `${tc.name}.json`);
      if (!fs.existsSync(jsonPath)) {
        test.skip();
        return;
      }
      const preset = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

      // Skip if preset has no cluster group rules (autoFit only works with clustering)
      if (!preset.clusterGroupRules || preset.clusterGroupRules.length === 0) {
        console.log(`  ${tc.name}: no clusterGroupRules, skipping`);
        test.skip();
        return;
      }

      await prepareGraphView(page);

      // --- Phase 1: Apply WITHOUT autoFit ---
      await applyPresetWithAutoFit(page, preset, false);
      const withoutAutoFit = await measureOverlaps(page);
      console.log(`  ${tc.name} WITHOUT autoFit:`,
        `groups=${withoutAutoFit.groupCount}`,
        `nodes=${withoutAutoFit.nodeCount}`,
        `groupOverlaps=${withoutAutoFit.groupOverlapCount}`,
        `groupOverlapArea=${withoutAutoFit.groupOverlapArea}px²`,
        `nodeOverlaps=${withoutAutoFit.nodeOverlapCount}`,
      );

      await prepareGraphView(page);

      // --- Phase 2: Apply WITH autoFit ---
      await applyPresetWithAutoFit(page, preset, true);
      const withAutoFit = await measureOverlaps(page);
      console.log(`  ${tc.name} WITH autoFit:`,
        `groups=${withAutoFit.groupCount}`,
        `nodes=${withAutoFit.nodeCount}`,
        `groupOverlaps=${withAutoFit.groupOverlapCount}`,
        `groupOverlapArea=${withAutoFit.groupOverlapArea}px²`,
        `nodeOverlaps=${withAutoFit.nodeOverlapCount}`,
      );

      // --- Assertions ---
      // With autoFit ON, group overlaps should be reduced or zero
      expect(withAutoFit.groupOverlapCount,
        `Group overlap count should be ≤ without autoFit (${withoutAutoFit.groupOverlapCount})`)
        .toBeLessThanOrEqual(withoutAutoFit.groupOverlapCount);

      // With autoFit ON, group overlap area should be reduced or zero
      expect(withAutoFit.groupOverlapArea,
        `Group overlap area should be ≤ without autoFit (${withoutAutoFit.groupOverlapArea}px²)`)
        .toBeLessThanOrEqual(withoutAutoFit.groupOverlapArea);

      // With autoFit ON, node overlaps should be reduced or zero
      expect(withAutoFit.nodeOverlapCount,
        `Node overlap count should be ≤ without autoFit (${withoutAutoFit.nodeOverlapCount})`)
        .toBeLessThanOrEqual(withoutAutoFit.nodeOverlapCount);

      // Basic sanity: graph should still have nodes
      expect(withAutoFit.nodeCount).toBeGreaterThan(0);
    });
  }

  test("autoFit produces zero group overlap on large grouping preset", async () => {
    // Use a preset that is known to produce many groups
    const jsonPath = path.join(SAMPLES_DIR, "07-tag-taxonomy.json");
    const preset = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    await prepareGraphView(page);
    await applyPresetWithAutoFit(page, preset, true);
    const result = await measureOverlaps(page);

    console.log(`  07-tag-taxonomy autoFit zero-overlap check:`,
      `groups=${result.groupCount}`,
      `groupOverlaps=${result.groupOverlapCount}`,
      `nodeOverlaps=${result.nodeOverlapCount}`,
    );

    // With autoFit, there should be zero group overlaps
    expect(result.groupOverlapCount).toBe(0);
  });
});
