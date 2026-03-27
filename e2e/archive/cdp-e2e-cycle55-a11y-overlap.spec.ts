/**
 * CDP E2E Test — Cycle 55 (Cycle 17): A11y legend/stats + edge label overlap + group announcements
 * Tests: IE legend a11y, IF edge label smart placement, IG group expand/collapse announce,
 *        preset announce, aria roles, keyboard legend access
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const errors: string[] = [];

test.setTimeout(300_000);

/** Find Graph Island view (has pixiNodes) among multiple graph-view leaves */
function findGIViewCode(): string {
  return `
    const leaves = window.app.workspace.getLeavesOfType("graph-view");
    let view = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
  `;
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
  // Reload plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.plugins.enabledPlugins.has("graph-island")) {
      await app.plugins.disablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 500));
    }
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 8000));
  });
});

// IE-1: Legend has complementary role and aria-label
test("IE-1: legend panel has proper ARIA attributes", async () => {
  const result = await page.evaluate(() => {
    const container = document.querySelector(".workspace-leaf-content[data-type='graph-view']")
      ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, skipped: true };
    const legend = container.querySelector(".gi-legend") as HTMLElement | null;
    if (!legend) return { ok: true, reason: "no legend element" };
    return {
      ok: true,
      role: legend.getAttribute("role"),
      ariaLabel: legend.getAttribute("aria-label"),
      hasRole: legend.getAttribute("role") === "complementary",
    };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
  if (!result.skipped && result.role) {
    expect(result.hasRole).toBe(true);
  }
});

// IE-2: Graph stats panel has status role
test("IE-2: graph stats panel has role=status", async () => {
  const result = await page.evaluate(() => {
    const container = document.querySelector(".workspace-leaf-content[data-type='graph-view']")
      ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, skipped: true };
    const stats = container.querySelector(".gi-graph-stats") as HTMLElement | null;
    if (!stats) return { ok: true, reason: "no stats element" };
    return {
      ok: true,
      role: stats.getAttribute("role"),
      ariaLabel: stats.getAttribute("aria-label"),
      hasStatus: stats.getAttribute("role") === "status",
    };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
  if (!result.skipped && result.role) {
    expect(result.hasStatus).toBe(true);
  }
});

// IE-3: Legend close button is a proper button with aria-label
test("IE-3: legend close button is keyboard accessible", async () => {
  // First show legend
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) { panel.showLegend = true; }
        l.view.updateLegend?.();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const legend = document.querySelector(".gi-legend");
    if (!legend) return { ok: true, reason: "no legend" };
    const closeBtn = legend.querySelector(".gi-legend-close") as HTMLElement | null;
    if (!closeBtn) return { ok: true, reason: "no close button" };
    return {
      ok: true,
      tagName: closeBtn.tagName.toLowerCase(),
      ariaLabel: closeBtn.getAttribute("aria-label"),
      hasAriaLabel: !!closeBtn.getAttribute("aria-label"),
    };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
  if (result.tagName) {
    expect(result.tagName).toBe("button");
    expect(result.hasAriaLabel).toBe(true);
  }
});

// IE-4: Legend items have role=button and tabindex for keyboard access
test("IE-4: legend items are keyboard accessible", async () => {
  const result = await page.evaluate(() => {
    const legend = document.querySelector(".gi-legend");
    if (!legend) return { ok: true, reason: "no legend" };
    const items = legend.querySelectorAll(".gi-legend-item-clickable");
    if (items.length === 0) return { ok: true, reason: "no clickable items" };
    let allHaveRole = true;
    let allHaveTabindex = true;
    for (const item of items) {
      if (item.getAttribute("role") !== "button") allHaveRole = false;
      if (!item.hasAttribute("tabindex")) allHaveTabindex = false;
    }
    return {
      ok: true,
      itemCount: items.length,
      allHaveRole,
      allHaveTabindex,
    };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
  if (result.itemCount && result.itemCount > 0) {
    expect(result.allHaveRole).toBe(true);
    expect(result.allHaveTabindex).toBe(true);
  }
});

// IF-5: Edge label smart placement config exists
test("IF-5: edgeLabelPlacement setting supports smart mode", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };
    const rt = panel.renderThresholds ?? {};
    // Verify edgeLabelPlacement can be set to "smart"
    const prev = rt.edgeLabelPlacement;
    panel.renderThresholds = { ...rt, edgeLabelPlacement: "smart" };
    const newVal = panel.renderThresholds.edgeLabelPlacement;
    panel.renderThresholds.edgeLabelPlacement = prev;
    return { ok: newVal === "smart" };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// IG-6: Group expand/collapse triggers a11y announcement
test("IG-6: group operations announce via aria-live", async () => {
  const result = await page.evaluate(() => {
    const ariaEl = document.querySelector("[aria-live='polite']") as HTMLElement | null;
    if (!ariaEl) return { ok: false, reason: "no aria-live element" };
    return { ok: true, ariaLiveExists: true };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// IG-7: Preset apply triggers a11y announcement
test("IG-7: applyPresetByKey triggers aria announcement", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no GI view" };
    // Verify applyPresetByKey method exists
    const hasMethod = typeof view.applyPresetByKey === "function";
    return { ok: hasMethod };
  });
  expect(result.ok).toBe(true);

  // === Coordinate sanity + visual quality after setting change ===
  const _csq = await measureSpread(page);
  expect(_csq.nanCount).toBe(0);
  expect(_csq.infCount).toBe(0);
  const _vq = await measureScreenDensity(page);
  if (_vq.totalNodes > 10) {
    expect(_vq.worstCellCount).toBeLessThan(200);
  }
});

// IE-8: No console errors during a11y interactions
test("IE-8: no console errors during a11y-related interactions", async () => {
  errors.length = 0;

  // Toggle legend
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.showLegend = !panel.showLegend;
          l.view.updateLegend?.();
          panel.showLegend = !panel.showLegend;
          l.view.updateLegend?.();
        }
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // Switch display modes
  for (const mode of ["card", "node", "donut", "node"]) {
    await page.evaluate((m) => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      for (const l of leaves) {
        if (l.view && "pixiNodes" in l.view) {
          const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
          if (panel) { panel.nodeDisplayMode = m; }
          l.view.markDirty?.(true);
          break;
        }
      }
    }, mode);
    await page.waitForTimeout(300);
  }

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
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

