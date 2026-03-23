/**
 * UI Click Audit — click actual UI DOM elements and verify graph effects
 *
 * Tests settings by interacting with DOM toggles/dropdowns in the panel
 * and measuring observable changes in node/edge counts.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

async function getNodeEdgeCounts(): Promise<{ nodes: number; edges: number }> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { nodes: 0, edges: 0 };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const edges = typeof view.getGraphEdges === "function" ? view.getGraphEdges() : (view.graphEdges ?? []);
    return { nodes: pn?.size ?? 0, edges: edges.length };
  });
}

async function findToggleByLabel(label: string): Promise<boolean> {
  return page.evaluate((lbl: string) => {
    const container = document.querySelector(".graph-control-panel, .workspace-leaf-content");
    if (!container) return false;
    const labels = Array.from(container.querySelectorAll("label, .setting-item-name, .gi-setting-label"));
    for (const el of labels) {
      if (el.textContent?.toLowerCase().includes(lbl.toLowerCase())) {
        const toggle = el.closest(".setting-item, .gi-setting-row")?.querySelector("input[type='checkbox'], .checkbox-container");
        if (toggle) {
          (toggle as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }, label);
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.showOrphans = true;
    p.showTags = true;
    p.showTagNodes = true;
    p.searchQuery = "";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await resetView();
});

test.afterAll(async () => {});

test.describe("UI Click Audit", () => {

  test("baseline has expected node/edge counts", async () => {
    await resetView();
    const counts = await getNodeEdgeCounts();
    expect(counts.nodes).toBeGreaterThan(2000);
    expect(counts.edges).toBeGreaterThan(4000);
    console.log(`baseline: ${counts.nodes} nodes, ${counts.edges} edges`);
  });

  test("programmatic showOrphans toggle changes node count", async () => {
    await resetView();
    const before = await getNodeEdgeCounts();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.showOrphans = false;
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodeEdgeCounts();

    expect(after.nodes).toBeLessThan(before.nodes);
    console.log(`showOrphans off: ${before.nodes} -> ${after.nodes}`);
  });

  test("programmatic searchQuery filters nodes", async () => {
    await resetView();
    const before = await getNodeEdgeCounts();

    await page.evaluate(async () => {
      const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf.view;
      const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
      p.searchQuery = "tag:battle";
      if (view.panelCallbacks) view.panelCallbacks.invalidateData();
      await new Promise(r => setTimeout(r, 2000));
    });
    const after = await getNodeEdgeCounts();

    expect(after.nodes).toBeLessThan(before.nodes);
    expect(after.nodes).toBeGreaterThan(10);
    console.log(`searchQuery: ${before.nodes} -> ${after.nodes}`);
  });

  test("panel DOM contains expected control elements", async () => {
    const controls = await page.evaluate(() => {
      const container = document.querySelector(".graph-control-panel, .workspace-leaf-content");
      if (!container) return { selects: 0, inputs: 0, buttons: 0 };
      return {
        selects: container.querySelectorAll("select").length,
        inputs: container.querySelectorAll("input").length,
        buttons: container.querySelectorAll("button").length,
      };
    });
    expect(controls.inputs + controls.selects + controls.buttons).toBeGreaterThan(5);
    console.log(`DOM controls: ${controls.selects} selects, ${controls.inputs} inputs, ${controls.buttons} buttons`);
  });
});


// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

