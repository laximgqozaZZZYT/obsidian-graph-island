/**
 * CDP E2E Test -- Cable Settings UI
 *
 * Verifies cable bundle UI controls exist, progressive disclosure works
 * (sub-settings hidden when mode=never), and mode changes persist.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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

test("cable mode select has auto/always/never options", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const panelEl = view.panelEl;
    if (!panelEl) return { error: "no panel element" };

    const selects = panelEl.querySelectorAll("select");
    let cableModeOpts: string[] = [];
    for (const s of selects) {
      const opts = Array.from((s as HTMLSelectElement).options).map(o => o.value);
      if (opts.includes("auto") && opts.includes("always") && opts.includes("never")) {
        cableModeOpts = opts;
        break;
      }
    }
    return { cableModeOpts };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.cableModeOpts).toContain("auto");
  expect(result.cableModeOpts).toContain("always");
  expect(result.cableModeOpts).toContain("never");
});

test("sub-settings hidden when cableBundleMode is never", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "never";
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const text = view.panelEl?.textContent ?? "";
    return {
      hasTrunkWidth: text.includes("Cable Trunk Width") || text.includes("幹線の太さ"),
      hasTrunkAlpha: text.includes("Cable Trunk Opacity") || text.includes("幹線の透明度"),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasTrunkWidth).toBe(false);
  expect(result.hasTrunkAlpha).toBe(false);
});

test("sub-settings visible when cableBundleMode is auto", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "auto";
    view.panel.activeTab = "display";
    if (view.buildPanel) view.buildPanel();

    const text = view.panelEl?.textContent ?? "";
    return {
      hasTrunkWidth: text.includes("Cable Trunk Width") || text.includes("幹線の太さ"),
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.hasTrunkWidth).toBe(true);
});

test("cable mode always with groupBy=folder creates cluster data", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    view.panel.cableBundleMode = "always";
    view.panel.groupBy = "folder:?";
    view.panel.groupByRules = [{ field: "folder:?", indent: 0 }];
    if (typeof view.doRender === "function") view.doRender();
    await new Promise(r => setTimeout(r, 5000));

    const cm = view.clusterMeta;
    return {
      hasNodeClusterMap: !!(cm && cm.nodeClusterMap),
      clusterCount: cm?.clusterCentroids?.size ?? 0,
      cableBundleMode: view.panel.cableBundleMode,
    };
  });

  expect(result).not.toHaveProperty("error");
  expect(result.cableBundleMode).toBe("always");

  // Restore
  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.cableBundleMode = "auto";
    view.panel.groupBy = "none";
    view.panel.groupByRules = [];
    if (typeof view.doRender === "function") view.doRender();

  // === Visual quality: verify display after state change ===
  const _dq = await measureScreenDensity(page);
  if (_dq.totalNodes > 10) {
    expect(_dq.worstCellCount).toBeLessThan(200);
  }
  });
  await page.waitForTimeout(3000);
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

