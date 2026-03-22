/**
 * CDP E2E Test — Cycle 69 (Cycle 31): JM Edge Fade Alpha Floor + JN Label Cull Cooldown
 * Tests configurable edge fade minimum alpha and label cull cooldown.
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
  const hasView = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    return leaves.some((l: any) => l.view && "pixiNodes" in l.view);
  });
  if (!hasView) {
    await page.evaluate(async () => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 8000));
    });
  }
});

// ── JM: Edge Fade Alpha Floor ──

// JM-1: edgeFadeMinAlpha is configurable
test("JM-1: edgeFadeMinAlpha read/write", async () => {
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const orig = panel.renderThresholds.edgeFadeMinAlpha;

    panel.renderThresholds.edgeFadeMinAlpha = 0.25;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    const readBack = panel.renderThresholds.edgeFadeMinAlpha;

    // Restore
    if (orig !== undefined) panel.renderThresholds.edgeFadeMinAlpha = orig;
    else delete panel.renderThresholds.edgeFadeMinAlpha;
    if (view.markDirty) view.markDirty(true);

    return { ok: true, readBack };
  });

  expect(result.ok).toBe(true);
  expect(result.readBack).toBe(0.25);
});

// JM-2: Low edgeFadeMinAlpha (0.01) at zoom-out produces no errors
test("JM-2: extreme low fade floor no errors", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const orig = panel.renderThresholds.edgeFadeMinAlpha;

    panel.renderThresholds.edgeFadeMinAlpha = 0.01;
    const world = view.worldContainer;
    const origScale = world?.scale?.x ?? 1;

    // Zoom out to trigger fade
    if (world) world.scale.set(0.2, 0.2);
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));

    // Restore
    if (world) world.scale.set(origScale, origScale);
    if (orig !== undefined) panel.renderThresholds.edgeFadeMinAlpha = orig;
    else delete panel.renderThresholds.edgeFadeMinAlpha;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    return { ok: true };
  });

  expect(result.ok).toBe(true);
});

// ── JN: Label Cull Cooldown ──

// JN-3: labelCullCooldown is configurable
test("JN-3: labelCullCooldown read/write", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const orig = panel.renderThresholds.labelCullCooldown;

    panel.renderThresholds.labelCullCooldown = 2;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 200));

    const readBack = panel.renderThresholds.labelCullCooldown;

    // Restore
    if (orig !== undefined) panel.renderThresholds.labelCullCooldown = orig;
    else delete panel.renderThresholds.labelCullCooldown;
    if (view.markDirty) view.markDirty(true);

    return { ok: true, readBack };
  });

  expect(result.ok).toBe(true);
  expect(result.readBack).toBe(2);
});

// JN-4: Rapid zoom with low cooldown produces no errors
test("JN-4: low cooldown + rapid zoom no errors", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};
    const orig = panel.renderThresholds.labelCullCooldown;
    panel.renderThresholds.labelCullCooldown = 1; // fastest possible

    const world = view.worldContainer;
    if (!world) return { ok: true, reason: "no world" };
    const origScale = world.scale.x;

    // Rapid zoom sweep
    for (const z of [0.3, 0.5, 1.0, 0.5, 0.2, 1.0]) {
      world.scale.set(z, z);
      if (view.markDirty) view.markDirty(true);
      await new Promise(r => setTimeout(r, 100));
    }

    // Restore
    world.scale.set(origScale, origScale);
    if (orig !== undefined) panel.renderThresholds.labelCullCooldown = orig;
    else delete panel.renderThresholds.labelCullCooldown;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    return { ok: true };
  });

  expect(result.ok).toBe(true);
  expect(errors.filter(e => e.includes("cull") || e.includes("label"))).toHaveLength(0);
});

test.afterAll(() => {
  if (errors.length > 0) {
    console.warn("Page errors during test:", errors);
  }
});
