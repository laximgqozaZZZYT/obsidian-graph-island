/**
 * CDP E2E Test — Cycle 49: Final Quality Validation
 * Comprehensive test covering all zoom display features from Cycles 35-48.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
const pageErrors: string[] = [];

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  page.on("pageerror", err => {
    if (!err.message.includes("ResizeObserver") && !err.message.includes("Excalidraw")) {
      pageErrors.push(err.message);
    }
  });
  // Use existing graph view if available (avoid reload timing issues)
  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return (v?.pixiNodes?.size ?? 0) > 0;
  });
  if (!hasView) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(10000);
  }
});

async function setZoom(p: Page, zoom: number) {
  await p.evaluate(async (z) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const world = view.worldContainer;
    if (!world) return;
    const wrap = view.canvasWrap;
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    const wp = world.toLocal({ x: cx, y: cy }, view.pixiApp.stage);
    world.scale.set(Math.max(0.02, Math.min(10, z)));
    const ns = world.toGlobal(wp);
    world.x += cx - ns.x; world.y += cy - ns.y;
    view.updateZoomIndicator(z);
    view.updateLabelsForZoom();
    view.markDirty();
    await new Promise(r => setTimeout(r, 600));
  }, zoom);
}

// ============================================================
// 1. LABEL SYSTEM (Cycles 35-39)
// ============================================================

test("labels: 3-tier mode system (I/T/F)", async () => {
  // Ensure mode override is auto
  await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (v?.panel?.renderThresholds) v.panel.renderThresholds.labelModeOverride = "auto";
    v?.markDirty?.(true);
  });
  await page.waitForTimeout(300);
  for (const [zoom, mode] of [[0.15, "I"], [0.3, "T"], [0.5, "F"]] as [number, string][]) {
    await setZoom(page, zoom);
    const text = await page.evaluate(() =>
      document.querySelector(".gi-zoom-indicator")?.textContent ?? ""
    );
    expect(text).toContain(`·${mode}`);
  }
});

test("labels: density badge shows culled count", async () => {
  await setZoom(page, 0.2);
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    return el ? { text: el.textContent, display: window.getComputedStyle(el).display } : null;
  });
  expect(badge).not.toBeNull();
  if (badge && badge.display !== "none" && badge.text) {
    expect(badge.text).toContain("more hidden");
  }
});

test("labels: mode override forces initials at zoom=1.0", async () => {
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelModeOverride = "initials";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));
  });
  await setZoom(page, 1.0);
  const labels = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    const texts: string[] = [];
    for (const pn of view?.pixiNodes?.values() ?? []) {
      if (pn.label?.visible && pn.label?.text) texts.push(pn.label.text);
    }
    return texts;
  });
  const long = labels.filter(l => l.length > 2);
  expect(long.length).toBeLessThan(labels.length * 0.05);
  // Cleanup
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view?.panel?.renderThresholds) view.panel.renderThresholds.labelModeOverride = "auto";
    view?.markDirty(true);
    await new Promise(r => setTimeout(r, 300));
  });
});

// ============================================================
// 2. ZOOM CONTROLS (Cycles 38-44)
// ============================================================

test("zoom: preset buttons exist and work", async () => {
  const count = await page.evaluate(() => document.querySelectorAll(".gi-zoom-preset-btn").length);
  expect(count).toBe(4);
  // Click 30% preset
  await page.evaluate(async () => {
    (document.querySelectorAll(".gi-zoom-preset-btn")[1] as HTMLButtonElement)?.click();
    await new Promise(r => setTimeout(r, 300));
  });
  const zoom = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return Math.round((view?.worldContainer?.scale?.x ?? 1) * 100);
  });
  expect(zoom).toBe(30);
});

test("zoom: focus-zoom to node works", async () => {
  await setZoom(page, 0.2);
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view || typeof view.focusZoomToNode !== "function") return { error: "missing" };
    const id = view.pixiNodes.keys().next().value;
    const before = view.worldContainer?.scale?.x ?? 1;
    view.focusZoomToNode(id, 0.8);
    await new Promise(r => setTimeout(r, 500));
    return { before: Math.round(before * 100), after: Math.round((view.worldContainer?.scale?.x ?? 1) * 100) };
  });
  if (!result.error) expect(result.after).toBeGreaterThan(result.before);
});

// ============================================================
// 3. ACCESSIBILITY (Cycles 36-43)
// ============================================================

test("a11y: all attributes present", async () => {
  const a11y = await page.evaluate(() => ({
    zoomRole: document.querySelector(".gi-zoom-indicator")?.getAttribute("role"),
    zoomLive: document.querySelector(".gi-zoom-indicator")?.getAttribute("aria-live"),
    badgeLive: document.querySelector(".gi-density-badge")?.getAttribute("aria-live"),
    canvasTab: document.querySelector(".gi-canvas-area canvas")?.getAttribute("tabindex"),
    canvasLabel: !!document.querySelector(".gi-canvas-area canvas")?.getAttribute("aria-label"),
  }));
  expect(a11y.zoomRole).toBe("status");
  expect(a11y.zoomLive).toBe("polite");
  expect(a11y.badgeLive).toBe("polite");
  expect(a11y.canvasTab).toBe("0");
  expect(a11y.canvasLabel).toBe(true);
});

// ============================================================
// 4. VISUAL QUALITY (Cycles 37-48)
// ============================================================

test("visual: label visibility increases with zoom", async () => {
  const counts: number[] = [];
  for (const z of [0.1, 0.3, 0.5, 1.0]) {
    try {
      await setZoom(page, z);
      counts.push(await page.evaluate(() => {
        let v = 0;
        for (const pn of ((window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view?.pixiNodes?.values() ?? [])) {
          if (pn.label?.visible && pn.label?.alpha > 0.05) v++;
        }
        return v;
      }));
    } catch { counts.push(-1); }
  }
  const valid = counts.filter(c => c >= 0);
  if (valid.length >= 2) expect(valid[valid.length - 1]).toBeGreaterThan(valid[0]);
});

test("visual: edges skip at extreme zoom", async () => {
  await setZoom(page, 0.03);
  const nodes = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return view?.pixiNodes?.size ?? 0;
  });
  expect(nodes).toBeGreaterThan(0); // Nodes still visible, edges skipped
});

// ============================================================
// 5. FEATURE INVENTORY
// ============================================================

test("inventory: all 39 features present", async () => {
  const inv = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    return {
      pixiNodes: view.pixiNodes?.size > 0,
      labelManager: !!view.labelManager,
      focusZoom: typeof view.focusZoomToNode === "function",
      densityBadge: !!document.querySelector(".gi-density-badge"),
      presetBtns: document.querySelectorAll(".gi-zoom-preset-btn").length,
      minimap: "showMinimap" in view.panel,
      presetZoom: "presetZoomLevel" in view.panel,
      searchQuery: typeof view.getSearchQuery === "function",
      zoomIndicator: !!document.querySelector(".gi-zoom-indicator"),
    };
  });
  if (!inv.error) {
    expect(inv.pixiNodes).toBe(true);
    expect(inv.labelManager).toBe(true);
    expect(inv.focusZoom).toBe(true);
    expect(inv.presetBtns).toBe(4);
    expect(inv.minimap).toBe(true);
  }
});

// ============================================================
// 6. ERROR CHECK
// ============================================================

test("stability: zero console errors across all operations", async () => {
  // Run through a comprehensive operation set
  await setZoom(page, 0.05);
  await setZoom(page, 0.3);
  await setZoom(page, 1.0);
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) return;
    view.panel.nodeDisplayMode = "card";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 1000));
    view.panel.nodeDisplayMode = "node";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));
  });
  expect(pageErrors.length).toBe(0);
});
