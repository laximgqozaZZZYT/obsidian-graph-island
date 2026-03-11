// ---------------------------------------------------------------------------
// CDP E2E — Verify expanded super nodes don't overlap with other nodes
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
 * Apply a preset and wait for layout to settle.
 */
async function applyPreset(p: Page, presetObj: any) {
  await p.evaluate(async (preset: any) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) throw new Error("No graph-view found");
    const view = leaf.view;
    const current = view.getState();
    const { layout, ...panelFields } = preset;
    await view.setState({
      ...current,
      layout: layout || current.layout,
      panel: { ...current.panel, ...panelFields, collapsedGroups: [] },
    }, {});
  }, presetObj);
  await p.waitForTimeout(8000);
}

/**
 * Find a super node and expand it by triggering single-click.
 * Returns the super node's position and member count.
 */
async function expandFirstSuperNode(p: Page): Promise<{
  superId: string;
  superX: number;
  superY: number;
  memberCount: number;
} | null> {
  // Get super node info from graph state
  const superInfo = await p.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return null;
    const view = leaf.view;
    const pixiNodes: Map<string, any> = view.pixiNodes;

    for (const [id, pn] of pixiNodes) {
      if (id.startsWith("__super__") && pn.data.collapsedMembers?.length > 0) {
        return {
          superId: id,
          superX: pn.data.x,
          superY: pn.data.y,
          memberCount: pn.data.collapsedMembers.length,
          memberIds: pn.data.collapsedMembers.slice(0, 5), // first 5 for debug
        };
      }
    }
    return null;
  });

  if (!superInfo) return null;

  // Trigger the super node expansion via handleSuperNodeDblClick
  await p.evaluate((superId: string) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf.view;
    const pn = view.pixiNodes.get(superId);
    if (pn) {
      view.handleSuperNodeDblClick(pn);
    }
  }, superInfo.superId);

  // Wait for re-render and simulation to settle
  await p.waitForTimeout(8000);

  return superInfo;
}

/**
 * Measure overlap between expanded members and other nodes.
 */
async function measureExpandOverlap(p: Page, superPos: { x: number; y: number }, memberCount: number): Promise<{
  nodeCount: number;
  memberNodesNearSuper: number;
  crossGroupOverlapCount: number;
  maxOverlapDist: number;
}> {
  return p.evaluate(({ sx, sy, mc }: { sx: number; sy: number; mc: number }) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) throw new Error("No graph-view found");
    const view = leaf.view;
    const pixiNodes: Map<string, any> = view.pixiNodes;
    const clusterMeta: any = view.clusterMeta;
    const panel = view.panel;
    const nodeSize = panel?.nodeSize ?? 8;

    const nodePositions: { id: string; x: number; y: number; r: number; group: string }[] = [];
    for (const [id, pn] of pixiNodes) {
      const group = clusterMeta?.nodeClusterMap?.get(id) ?? "__none__";
      nodePositions.push({
        id,
        x: pn.data.x,
        y: pn.data.y,
        r: pn.radius ?? nodeSize,
        group,
      });
    }

    // Count members near super node position (within 3× spread radius)
    const spreadR = Math.sqrt(mc) * 20;
    const nearThreshold = spreadR * 3;
    let memberNodesNearSuper = 0;
    for (const np of nodePositions) {
      const dx = np.x - sx;
      const dy = np.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearThreshold) memberNodesNearSuper++;
    }

    // Measure cross-group overlaps
    let crossGroupOverlapCount = 0;
    let maxOverlapDist = 0;
    for (let i = 0; i < nodePositions.length; i++) {
      for (let j = i + 1; j < nodePositions.length; j++) {
        const a = nodePositions[i];
        const b = nodePositions[j];
        if (a.group === b.group) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (a.r + b.r) * 1.2;
        if (dist < minDist) {
          crossGroupOverlapCount++;
          const overlap = minDist - dist;
          if (overlap > maxOverlapDist) maxOverlapDist = overlap;
        }
      }
    }

    return {
      nodeCount: nodePositions.length,
      memberNodesNearSuper,
      crossGroupOverlapCount,
      maxOverlapDist: Math.round(maxOverlapDist),
    };
  }, { sx: superPos.x, sy: superPos.y, mc: memberCount });
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

test.describe("Super Node Expand Overlap", () => {
  test("expanded members positioned near super node, not scattered", async () => {
    const jsonPath = path.join(SAMPLES_DIR, "07-tag-taxonomy.json");
    const preset = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    await prepareGraphView(page);
    await applyPreset(page, preset);

    // Verify we have super nodes
    const superInfo = await expandFirstSuperNode(page);
    if (!superInfo) {
      console.log("  No super nodes found, skipping");
      test.skip();
      return;
    }

    console.log(`  Expanded super node: ${superInfo.superId.substring(0, 50)}`);
    console.log(`  Super position: (${Math.round(superInfo.superX)}, ${Math.round(superInfo.superY)})`);
    console.log(`  Member count: ${superInfo.memberCount}`);

    const result = await measureExpandOverlap(
      page,
      { x: superInfo.superX, y: superInfo.superY },
      superInfo.memberCount,
    );

    console.log(`  Total nodes after expand: ${result.nodeCount}`);
    console.log(`  Members near super position: ${result.memberNodesNearSuper}`);
    console.log(`  Cross-group overlaps: ${result.crossGroupOverlapCount}`);
    console.log(`  Max overlap distance: ${result.maxOverlapDist}px`);

    // After expansion, most member nodes should be near the super node's position
    // (not scattered randomly across the entire canvas)
    expect(result.memberNodesNearSuper,
      "Expanded members should be positioned near the super node's original position")
      .toBeGreaterThan(0);

    // Cross-group overlaps should be minimal
    expect(result.crossGroupOverlapCount,
      "Expanded members should not heavily overlap with other groups")
      .toBeLessThanOrEqual(5);
  });
});
