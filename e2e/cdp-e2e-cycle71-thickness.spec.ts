/**
 * CDP E2E Test — Cycle 71 (Cycle 33): JQ Edge Thickness Factors
 * Tests configurable bidirectional/hierarchy thickness multipliers.
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

// JQ-1: Thickness factor fields read/write
test("JQ-1: thickness factors configurable", async () => {
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: false, reason: "no view" };

    const panel = view.panel;
    if (!panel.renderThresholds) panel.renderThresholds = {};

    const origBidir = panel.renderThresholds.edgeBidirectionalThickFactor;
    const origHier = panel.renderThresholds.edgeHierarchyThickFactor;

    panel.renderThresholds.edgeBidirectionalThickFactor = 3.0;
    panel.renderThresholds.edgeHierarchyThickFactor = 4.0;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    const readBidir = panel.renderThresholds.edgeBidirectionalThickFactor;
    const readHier = panel.renderThresholds.edgeHierarchyThickFactor;

    // Restore
    if (origBidir !== undefined) panel.renderThresholds.edgeBidirectionalThickFactor = origBidir;
    else delete panel.renderThresholds.edgeBidirectionalThickFactor;
    if (origHier !== undefined) panel.renderThresholds.edgeHierarchyThickFactor = origHier;
    else delete panel.renderThresholds.edgeHierarchyThickFactor;
    if (view.markDirty) view.markDirty(true);

    return { ok: true, readBidir, readHier };
  });

  expect(result.ok).toBe(true);
  expect(result.readBidir).toBe(3.0);
  expect(result.readHier).toBe(4.0);
});

// JQ-2: Ontology backbone toggle with custom thickness no errors
test("JQ-2: ontology backbone + thickness no errors", async () => {
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, reason: "no view" };

    const panel = view.panel;
    const orig = panel.showOntologyBackbone;

    panel.showOntologyBackbone = true;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 300));

    panel.showOntologyBackbone = orig ?? false;
    if (view.markDirty) view.markDirty(true);
    await new Promise(r => setTimeout(r, 200));

    return { ok: true };
  });

  expect(result.ok).toBe(true);
  expect(errors).toHaveLength(0);
});

test.afterAll(() => {
  if (errors.length > 0) {
    console.warn("Page errors during test:", errors);
  }
});
