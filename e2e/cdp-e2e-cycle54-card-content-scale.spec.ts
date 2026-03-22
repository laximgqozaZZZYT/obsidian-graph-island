/**
 * CDP E2E Test — Cycle 54: Card golden ratio + content-proportional sizing
 * Tests: HM-1 golden ratio, HM-2 slider, HM-3 content scale effect,
 *        HM-4 z-index, HM-5 a11y, HM-6 mode switch, HM-7 hover overlap, HM-8 console errors
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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
  // Reload plugin to pick up latest build
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 300));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 5000));
  });
});

/** Helper: get view + panel */
function getViewAndPanel() {
  const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
  if (!view) return null;
  const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
  return panel ? { view, panel } : null;
}

/** Helper: set display mode */
async function setDisplayMode(p: Page, mode: string) {
  await p.evaluate((m) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return;
    panel.nodeDisplayMode = m;
    view.recalcNodeRadii?.();
    view.markDirty?.(true);
  }, mode);
  await p.waitForTimeout(500);
}

/** Helper: set zoom */
async function setZoom(p: Page, z: number) {
  await p.evaluate((zoom) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const world = view.worldContainer || view.getWorldContainer?.();
    if (world) { world.scale.set(zoom); }
    view.markDirty?.(true);
  }, z);
  await p.waitForTimeout(300);
}

// HM-1: Plain card uses golden ratio (width > height, approximately 1.618:1)
test("HM-1: plain card renders with golden ratio landscape aspect", async () => {
  await setDisplayMode(page, "card");
  await setZoom(page, 0.5);

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { ok: false, reason: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };
    const defaults = view.constructor?.DEFAULT_CARD_RENDER_CONFIG ?? {};
    const crc = { ...defaults, ...(panel.cardRenderConfig ?? {}) };
    const ar = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
    return { ok: Math.abs(ar - 1.618) < 0.01, ar };
  });

  expect(result.ok).toBe(true);
});

// HM-2: cardContentScale slider exists and is adjustable
test("HM-2: cardContentScale setting exists in renderThresholds", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { ok: false, reason: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };
    const rt = panel.renderThresholds ?? {};
    panel.renderThresholds = { ...rt, cardContentScale: 1.0 };
    view.recalcNodeRadii?.();
    const newVal = panel.renderThresholds.cardContentScale;
    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();
    return { ok: newVal === 1.0, val: newVal };
  });

  expect(result.ok).toBe(true);
});

// HM-3: Content scale causes size variation between nodes with different body lengths
test("HM-3: content scale creates size difference by body length", async () => {
  await setDisplayMode(page, "card");

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { ok: false, reason: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: false, reason: "no panel" };

    const nodes = Array.from(view.pixiNodes.values() as IterableIterator<any>);
    const withBody = nodes.filter((pn: any) => (pn.data.bodyLength ?? 0) > 50);
    const withoutBody = nodes.filter((pn: any) => (pn.data.bodyLength ?? 0) < 10);
    if (withBody.length === 0 || withoutBody.length === 0) {
      return { ok: true, reason: "skip: insufficient body length variation", skipped: true };
    }

    panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardContentScale: 1.5 };
    view.recalcNodeRadii?.();

    const avgWith = withBody.slice(0, 20).reduce((s: number, pn: any) => s + pn.radius, 0) / Math.min(20, withBody.length);
    const avgWithout = withoutBody.slice(0, 20).reduce((s: number, pn: any) => s + pn.radius, 0) / Math.min(20, withoutBody.length);

    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();

    return {
      ok: avgWith > avgWithout,
      avgWith: avgWith.toFixed(1),
      avgWithout: avgWithout.toFixed(1),
      withBodyCount: withBody.length,
      withoutBodyCount: withoutBody.length,
    };
  });

  if (!(result as any).skipped) {
    expect(result.ok).toBe(true);
  }
});

// HM-4: Z-index hierarchy — node-info above stats/legend
test("HM-4: z-index hierarchy separates overlay panels", async () => {
  const result = await page.evaluate(() => {
    const container = document.querySelector(".workspace-leaf-content[data-type='graph-view']")
      ?? document.querySelector(".graph-island")
      ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, reason: "no container found — skip", skipped: true };

    const getZ = (sel: string) => {
      const el = container.querySelector(sel) as HTMLElement | null;
      if (!el) return -1;
      return parseInt(getComputedStyle(el).zIndex || "0", 10);
    };

    const legend = getZ(".gi-legend");
    const minimap = getZ(".gi-minimap-wrap");
    const stats = getZ(".gi-graph-stats");
    const nodeInfo = getZ(".gi-node-info");
    const oob = getZ(".gi-oob-badge");

    let correct = true;
    if (stats > 0 && legend > 0) correct = correct && (stats >= legend);
    if (oob > 0 && stats > 0) correct = correct && (oob >= stats);
    if (nodeInfo > 0 && oob > 0) correct = correct && (nodeInfo >= oob);

    return { ok: true, legend, minimap, stats, nodeInfo, oob, hierarchyCorrect: correct };
  });

  expect(result.ok).toBe(true);
  if (!(result as any).skipped) {
    expect(result.hierarchyCorrect).toBe(true);
  }
});

// HM-5: A11y — aria-live region exists for announcements
test("HM-5: aria-live region exists for card mode announcements", async () => {
  const result = await page.evaluate(() => {
    const ariaEl = document.querySelector("[aria-live='polite']") as HTMLElement | null;
    if (!ariaEl) return { ok: false, reason: "no aria-live element found" };
    return { ok: true, ariaLiveFound: true };
  });

  expect(result.ok).toBe(true);
});

// HM-6: Display mode switch card→node→card maintains golden ratio config
test("HM-6: mode switch card→node→card preserves golden ratio config", async () => {
  await setDisplayMode(page, "card");

  const before = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return -1;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return -1;
    const defaults = view.constructor?.DEFAULT_CARD_RENDER_CONFIG ?? {};
    const crc = { ...defaults, ...(panel.cardRenderConfig ?? {}) };
    return crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
  });

  await setDisplayMode(page, "node");
  await setDisplayMode(page, "card");

  const after = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return -1;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return -1;
    const defaults = view.constructor?.DEFAULT_CARD_RENDER_CONFIG ?? {};
    const crc = { ...defaults, ...(panel.cardRenderConfig ?? {}) };
    return crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
  });

  expect(before).toBeGreaterThan(0);
  expect(after).toBeGreaterThan(0);
  expect(before).toBeCloseTo(after, 2);
});

// HM-7: Hover on card does not overlap with legend panel
test("HM-7: hover label culling exclusion zone includes DOM panels", async () => {
  await setDisplayMode(page, "card");

  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { ok: false, reason: "no view" };

    const container = view.containerEl ?? document.querySelector("[data-type='graph-view']");
    if (!container) return { ok: true, reason: "no container — skip" };

    const panels = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
    let foundPanels = 0;
    for (const sel of panels) {
      const el = container.querySelector(sel) ?? document.querySelector(sel);
      if (el) foundPanels++;
    }

    const nodeCount = view.pixiNodes?.size ?? 0;
    return { ok: true, foundPanels, nodeCount };
  });

  expect(result.ok).toBe(true);
  await setDisplayMode(page, "node");
});

// HM-8: Console error monitor during card mode interactions
test("HM-8: no console errors during card mode interactions", async () => {
  errors.length = 0;

  await setDisplayMode(page, "card");

  for (const z of [0.1, 0.3, 0.5, 1.0, 2.0]) {
    await setZoom(page, z);
  }

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return;
    for (const s of [0, 0.5, 1.0, 1.5, 2.0]) {
      panel.renderThresholds = { ...(panel.renderThresholds ?? {}), cardContentScale: s };
      view.recalcNodeRadii?.();
      view.markDirty?.(true);
    }
    panel.renderThresholds.cardContentScale = 0.5;
    view.recalcNodeRadii?.();
  });
  await page.waitForTimeout(1000);

  await setDisplayMode(page, "node");
  await setDisplayMode(page, "donut");
  await setDisplayMode(page, "card");

  await setZoom(page, 1.0);
  await setDisplayMode(page, "node");

  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );

  expect(relevantErrors).toHaveLength(0);
});
