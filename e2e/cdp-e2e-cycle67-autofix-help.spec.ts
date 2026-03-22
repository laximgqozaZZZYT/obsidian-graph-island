/**
 * CDP E2E Test — Cycle 67 (Cycle 29): JI Auto-Optimize Collision + JJ Help Overlay A11y
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

// ── JI: Auto-Optimize Label Overlap ──

// JI-1: autoOptimizeLabelOverlap API exists and returns structured result
test("JI-1: autoOptimizeLabelOverlap API is accessible", async () => {
  await page.waitForTimeout(2000);

  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };

    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const hasMethod = typeof view.autoOptimizeLabelOverlap === "function";
    if (!hasMethod) return { ok: false, reason: "method not found" };

    const result = view.autoOptimizeLabelOverlap();
    return {
      ok: true,
      hasOptimized: typeof result.optimized === "boolean",
      hasFinalMargin: typeof result.finalMargin === "number",
      hasFinalRate: typeof result.finalRate === "number",
      optimized: result.optimized,
      finalMargin: result.finalMargin,
      finalRate: result.finalRate?.toFixed(4),
    };
  });

  expect(result.ok).toBe(true);
  if (!result.skipped) {
    expect(result.hasOptimized).toBe(true);
    expect(result.hasFinalMargin).toBe(true);
  }
});

// JI-2: Auto-optimize produces collision rate ≤ 5% or exhausts retries
test("JI-2: auto-optimize reduces collision rate", async () => {
  const result = await page.evaluate(async () => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    let view: any = null;
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { view = l.view; break; } }
    if (!view) return { ok: true, skipped: true };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    if (!panel) return { ok: true, skipped: true };

    // Save original margin
    const origMargin = panel.renderThresholds?.labelOverlapMargin ?? 12;

    view.doRender?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const result = view.autoOptimizeLabelOverlap();

    // Restore original margin
    if (!panel.renderThresholds) panel.renderThresholds = {};
    panel.renderThresholds.labelOverlapMargin = origMargin;

    return {
      ok: true,
      finalRate: result.finalRate,
      finalMargin: result.finalMargin,
      // Either rate ≤ 5% or margin was increased (max 3 retries)
      effective: result.finalRate <= 0.05 || result.finalMargin > origMargin || result.finalRate === 0,
    };
  });

  expect(result.ok).toBe(true);
  if (!result.skipped) {
    expect(result.effective).toBe(true);
  }
});

// ── JJ: Help Overlay A11y ──

// JJ-3: Help overlay has role=dialog and aria-label
test("JJ-3: help overlay has proper ARIA dialog attributes", async () => {
  // Open help
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        l.view._toggleHelpOverlay?.();
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const overlay = document.querySelector(".gi-help-overlay");
    if (!overlay) return { ok: false, reason: "no help overlay" };
    return {
      ok: true,
      role: overlay.getAttribute("role"),
      ariaLabel: overlay.getAttribute("aria-label"),
      ariaModal: overlay.getAttribute("aria-modal"),
      hasDialog: overlay.getAttribute("role") === "dialog",
    };
  });

  // Close help
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        l.view._toggleHelpOverlay?.();
        break;
      }
    }
  });

  expect(result.ok).toBe(true);
  expect(result.hasDialog).toBe(true);
  expect(result.ariaLabel).toBeTruthy();
});

// JJ-4: Help tables have role=table and aria-label
test("JJ-4: shortcut tables have accessible role attributes", async () => {
  // Open help
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        l.view._toggleHelpOverlay?.();
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const tables = document.querySelectorAll(".gi-help-table");
    if (tables.length === 0) return { ok: false, reason: "no help tables" };
    let allHaveRole = true;
    let allHaveLabel = true;
    for (const t of tables) {
      if (t.getAttribute("role") !== "table") allHaveRole = false;
      if (!t.getAttribute("aria-label")) allHaveLabel = false;
    }
    return { ok: true, tableCount: tables.length, allHaveRole, allHaveLabel };
  });

  // Close help
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) {
      if (l.view && "pixiNodes" in l.view) {
        l.view._toggleHelpOverlay?.();
        break;
      }
    }
  });

  expect(result.ok).toBe(true);
  expect(result.allHaveRole).toBe(true);
  expect(result.allHaveLabel).toBe(true);
});

// JJ-5: Help overlay toggles correctly (open/close)
test("JJ-5: help overlay toggle works cleanly", async () => {
  // Ensure closed
  let exists = await page.evaluate(() => !!document.querySelector(".gi-help-overlay"));
  if (exists) {
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { l.view._toggleHelpOverlay?.(); break; } }
    });
  }

  // Open
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { l.view._toggleHelpOverlay?.(); break; } }
  });
  await page.waitForTimeout(200);
  const opened = await page.evaluate(() => !!document.querySelector(".gi-help-overlay"));

  // Close
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    for (const l of leaves) { if (l.view && "pixiNodes" in l.view) { l.view._toggleHelpOverlay?.(); break; } }
  });
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => !document.querySelector(".gi-help-overlay"));

  expect(opened).toBe(true);
  expect(closed).toBe(true);
});

// Stability
test("§0: no errors during auto-optimize + help overlay tests", async () => {
  const relevantErrors = errors.filter(e =>
    !e.includes("ResizeObserver") && !e.includes("Excalidraw") && !e.includes("net::ERR")
  );
  expect(relevantErrors).toHaveLength(0);
});
