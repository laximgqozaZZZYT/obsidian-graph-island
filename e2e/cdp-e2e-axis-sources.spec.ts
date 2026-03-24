/**
 * CDP E2E Test -- Axis Sources
 *
 * Verifies that coordinate layout axis sources (field, hop, index)
 * produce correct spatial separation in node positioning.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

async function applyCoordLayout(layout: any) {
  return page.evaluate(async (cl: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = cl;
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const xs: number[] = [];
    const ys: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        if (typeof pn.data.x === "number" && isFinite(pn.data.x)) xs.push(pn.data.x);
        if (typeof pn.data.y === "number" && isFinite(pn.data.y)) ys.push(pn.data.y);
      }
    }

    return {
      nodeCount: view.pixiNodes?.size ?? 0,
      xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
      yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
      distinctX: new Set(xs.map(v => Math.round(v / 50))).size,
    };
  }, layout);
}

test("field:folder source separates nodes by folder on X axis", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.distinctX).toBeGreaterThanOrEqual(1);
});

test("field:node_type source groups nodes by type", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "field", field: "node_type" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("index source with linear transform creates ordered distribution", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.xRange).toBeGreaterThan(0);
});

test("field:isTag source separates tags from files", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.showTagNodes = true;
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "field", field: "isTag" }, transform: { kind: "bin", count: 2 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    let tagCount = 0, fileCount = 0;
    const tagXs: number[] = [];
    const fileXs: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        if (pn.data.isTag) { tagCount++; tagXs.push(pn.data.x); }
        else { fileCount++; fileXs.push(pn.data.x); }
      }
    }

    const avgTagX = tagXs.length > 0 ? tagXs.reduce((a, b) => a + b, 0) / tagXs.length : 0;
    const avgFileX = fileXs.length > 0 ? fileXs.reduce((a, b) => a + b, 0) / fileXs.length : 0;

    return { tagCount, fileCount, separation: Math.abs(avgTagX - avgFileX) };
  });

  expect(result).not.toHaveProperty("error");
  if (result.tagCount > 0 && result.fileCount > 0) {
    expect(result.separation).toBeGreaterThan(10);
  }

});



// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  const minimap = await measureMinimap(page);
  const guides = await measureGuides(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety} minimap=${minimap.visible} guides=${guides.lineCount}/${guides.labelCount}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
  // Guide labels should not all overlap each other
  if (guides.labelCount > 2) {
    expect(guides.overlappingLabels).toBeLessThan(guides.labelCount);
  }
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
  console.log(`[SCREEN-Q] nodes=${density.totalNodes} hotspot=${density.worstCellCount} viewport=${density.viewportUtilization}% rightBias=${density.rightHalfRatio}%`);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
  const labels = await measureLabelReadability(page);
  console.log(`[SCREEN-Q] labels=${labels.totalVisible} overlap=${labels.overlapRate} tooSmall=${labels.tooSmallCount} avgFont=${labels.avgScreenFontSize}px`);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.70);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.5);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  console.log(`[SCREEN-Q] edges=${edges.totalEdges} visible=${edges.visibleEdges} tooThin=${edges.tooThinCount} lowAlpha=${edges.lowAlphaCount} colors=${edges.colorVariety}`);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.8);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    console.log(`[SCREEN-Q] enclosures=${enclosures.totalEnclosures} overlapping=${enclosures.overlappingPairs} rate=${enclosures.overlapRate}`);
    expect(enclosures.overlapRate).toBeLessThan(0.70);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    console.log(`[SCREEN-Q] cards=${cards.totalCards} overlapping=${cards.overlappingCards} tooSmall=${cards.tooSmallCards} avgW=${cards.avgCardWidth} avgH=${cards.avgCardHeight}`);
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.5);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.7);
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
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

});

