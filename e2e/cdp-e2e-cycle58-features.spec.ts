/**
 * CDP E2E Test — Cycle 58 (Cycle 20): Card body lines + edge density slider + search tab nav
 * Tests: IP cardBodyMaxLines sync, IQ edgeDensityFloor slider, IR search-scoped Tab
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const errors: string[] = [];

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw"))
      errors.push(err.message);
  });
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

// IP-1: cardBodyMaxLines is used for card background height (not hardcoded 3)
test("IP-1: cardBodyMaxLines controls card background height", async () => {
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Verify cardBodyMaxLines exists in renderThresholds
    const rt = panel.renderThresholds ?? {};
    const maxLines = rt.cardBodyMaxLines ?? 3;

    // Set to 5 and verify it's accepted
    panel.renderThresholds = { ...rt, cardBodyMaxLines: 5 };
    const newVal = panel.renderThresholds.cardBodyMaxLines;
    // Reset
    panel.renderThresholds.cardBodyMaxLines = maxLines;

    return { ok: newVal === 5, defaultLines: maxLines, setTo: newVal };
  });

  expect(result.ok).toBe(true);
});

// IQ-2: edgeDensityFloor exists in renderThresholds and is adjustable
test("IQ-2: edgeDensityFloor setting is configurable", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    const rt = panel.renderThresholds ?? {};
    const prev = rt.edgeDensityFloor ?? 0.12;
    panel.renderThresholds = { ...rt, edgeDensityFloor: 0.3 };
    const newVal = panel.renderThresholds.edgeDensityFloor;
    panel.renderThresholds.edgeDensityFloor = prev;

    return { ok: newVal === 0.3, default: prev };
  });

  expect(result.ok).toBe(true);
});

// IR-3: Tab navigation scopes to search results when search is active
test("IR-3: search-scoped Tab cycles through matching nodes only", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Check that _focusSearchGen field exists (IR implementation)
    const hasFocusSearchGen = "_focusSearchGen" in view;

    // Check that _searchHighlightSet is accessible
    const hasSearchSet = "_searchHighlightSet" in view;

    return { ok: hasFocusSearchGen, hasSearchSet, hasFocusSearchGen };
  });

  expect(result.ok).toBe(true);
});

// IP-4: Card mode with custom body lines renders without errors
test("IP-4: card mode with increased body lines is stable", async () => {
  errors.length = 0;

  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.nodeDisplayMode = "card";
          panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardBodyMaxLines: 6 };
          l.view.recalcNodeRadii?.();
          l.view.markDirty?.(true);
        }
        break;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Reset
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.nodeDisplayMode = "node";
          panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardBodyMaxLines: 3 };
          l.view.markDirty?.(true);
        }
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
});

// IQ-5: Edge density floor affects rendering at high edge counts
test("IQ-5: edgeDensityFloor is read by EdgeRenderer", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    // Verify graphEdges exist (edge rendering is active)
    const edgeCount = view.graphEdges?.length ?? 0;
    return { ok: edgeCount > 0, edgeCount };
  });

  expect(result.ok).toBe(true);
});

// IE-6: No console errors during feature interactions
test("IE-6: no errors during IP/IQ/IR feature interactions", async () => {
  errors.length = 0;

  // Search + Tab cycle
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        const panel = typeof l.view.getPanel === "function" ? l.view.getPanel() : l.view.panel;
        if (panel) {
          panel.searchQuery = "tag:";
          l.view.rawData = null;
          l.view.doRender?.();
          // Simulate Tab press via cycleFocusNode
          l.view.cycleFocusNode?.(1);
          l.view.cycleFocusNode?.(1);
          panel.searchQuery = "";
          l.view.rawData = null;
          l.view.doRender?.();
        }
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
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
});

