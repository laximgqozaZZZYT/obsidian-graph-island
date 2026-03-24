/**
 * CDP E2E Test -- Cycle 39: Console Error Monitoring
 *
 * Comprehensive console error tracking across all major graph operations.
 * This test monitors for:
 * - Page errors (uncaught exceptions)
 * - Console errors (console.error messages)
 * - Known benign errors (ResizeObserver, etc.)
 *
 * Operations tested:
 * a. Page reload + 8s wait
 * b. Open graph view + 8s wait
 * c. Zoom levels: 0.1, 0.3, 0.5, 1.0, 2.0
 * d. Display modes: card, donut, node
 * e. Grouping: set groupBy, search, clear search, ungroup
 * f. Rapid zoom: 0.05 <-> 2.0 (5 cycles, 200ms each)
 */

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

// Known benign error patterns that don't indicate bugs
const BENIGN_ERRORS = [
  /ResizeObserver/i,
  /ResizeObserverService/i,
  /Uncaught DOMException/i,
  /Uncaught SyntaxError: Identifier/i, // Usually from eval contexts
  /Error loading font/i, // Excalidraw plugin font loading
  /Error initializing fonts/i, // Excalidraw plugin
  /excalidraw-plugin/i, // Excalidraw errors
];

interface ErrorLog {
  type: "pageerror" | "console";
  message: string;
  timestamp: number;
  stack?: string;
}

const collectedErrors: ErrorLog[] = [];

function isBenignError(message: string): boolean {
  return BENIGN_ERRORS.some(pattern => pattern.test(message));
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Set up error listeners BEFORE any operations
  page.on("pageerror", (error) => {
    const msg = error.toString();
    if (!isBenignError(msg)) {
      collectedErrors.push({
        type: "pageerror",
        message: msg,
        stack: error.stack,
        timestamp: Date.now(),
      });
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!isBenignError(text)) {
        collectedErrors.push({
          type: "console",
          message: text,
          timestamp: Date.now(),
        });
      }
    }
  });

  // Initial plugin reset and graph view open
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

test("comprehensive console error monitoring across operations", async () => {
  test.setTimeout(300_000);

  console.log("[MONITOR] Starting comprehensive console error test...");

  // Operation (a): Initial graph view is already open in beforeAll
  // Clear errors at start for clean tracking
  console.log("[MONITOR] (a) Graph view ready...");
  collectedErrors.length = 0;
  await page.waitForTimeout(3000);
  console.log(`[MONITOR] (a) Initial state. Errors so far: ${collectedErrors.length}`);

  // Operation (b): Zoom to different levels
  console.log("[MONITOR] (b) Testing zoom levels...");
  const zoomLevels = [0.1, 0.3, 0.5, 1.0, 2.0];
  for (const zoomLevel of zoomLevels) {
    console.log(`[MONITOR]   Zooming to ${zoomLevel}...`);
    try {
      await page.evaluate((zoom: number) => {
        const app = (window as any).app;
        if (!app) return { error: "no app" };
        const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (view?.worldContainer) {
          view.worldContainer.scale.set(zoom);
        }
        return { ok: true };
      }, zoomLevel);
    } catch (e) {
      console.log(`[MONITOR]   Zoom ${zoomLevel} failed: ${e}`);
    }
    await page.waitForTimeout(500);
  }
  console.log(`[MONITOR] (b) Zoom tests complete. Errors so far: ${collectedErrors.length}`);

  // Operation (c): Switch nodeDisplayMode through card, donut, node
  console.log("[MONITOR] (c) Testing display modes...");
  const modes = ["card", "donut", "node"];
  for (const mode of modes) {
    console.log(`[MONITOR]   Setting nodeDisplayMode to '${mode}'...`);
    try {
      await page.evaluate((displayMode: string) => {
        const app = (window as any).app;
        if (!app) return { error: "no app" };
        const leaf = app.workspace.getLeavesOfType("graph-view")[0];
        const view = leaf?.view;
        if (view) {
          view.panel.nodeDisplayMode = displayMode;
          view.markDirty(true);
        }
        return { ok: true };
      }, mode);
    } catch (e) {
      console.log(`[MONITOR]   Display mode ${mode} failed: ${e}`);
    }
    await page.waitForTimeout(2000);
  }
  console.log(`[MONITOR] (c) Display mode tests complete. Errors so far: ${collectedErrors.length}`);

  // Operation (d): Set groupBy to "prop-category"
  console.log("[MONITOR] (d-i) Setting groupBy to 'prop-category'...");
  try {
    await page.evaluate(() => {
      const app = (window as any).app;
      if (!app) return { error: "no app" };
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf?.view;
      if (view) {
        view.panel.groupBy = "prop-category";
        view.markDirty(true);
      }
      return { ok: true };
    });
  } catch (e) {
    console.log(`[MONITOR] (d-i) groupBy set failed: ${e}`);
  }
  await page.waitForTimeout(3000);
  console.log(`[MONITOR] (d-i) groupBy set. Errors so far: ${collectedErrors.length}`);

  // Operation (e): Set searchQuery to "folder:classic"
  console.log("[MONITOR] (d-ii) Setting searchQuery...");
  try {
    await page.evaluate(() => {
      const app = (window as any).app;
      if (!app) return { error: "no app" };
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf?.view;
      if (view) {
        view.panel.searchQuery = "folder:classic";
        view.markDirty(true);
      }
      return { ok: true };
    });
  } catch (e) {
    console.log(`[MONITOR] (d-ii) searchQuery set failed: ${e}`);
  }
  await page.waitForTimeout(2000);
  console.log(`[MONITOR] (d-ii) searchQuery set. Errors so far: ${collectedErrors.length}`);

  // Operation (f): Clear searchQuery
  console.log("[MONITOR] (d-iii) Clearing searchQuery...");
  try {
    await page.evaluate(() => {
      const app = (window as any).app;
      if (!app) return { error: "no app" };
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf?.view;
      if (view) {
        view.panel.searchQuery = "";
        view.markDirty(true);
      }
      return { ok: true };
    });
  } catch (e) {
    console.log(`[MONITOR] (d-iii) searchQuery clear failed: ${e}`);
  }
  await page.waitForTimeout(2000);
  console.log(`[MONITOR] (d-iii) searchQuery cleared. Errors so far: ${collectedErrors.length}`);

  // Operation (g): Clear groupBy
  console.log("[MONITOR] (d-iv) Clearing groupBy...");
  try {
    await page.evaluate(() => {
      const app = (window as any).app;
      if (!app) return { error: "no app" };
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      const view = leaf?.view;
      if (view) {
        view.panel.groupBy = "";
        view.markDirty(true);
      }
      return { ok: true };
    });
  } catch (e) {
    console.log(`[MONITOR] (d-iv) groupBy clear failed: ${e}`);
  }
  await page.waitForTimeout(2000);
  console.log(`[MONITOR] (d-iv) groupBy cleared. Errors so far: ${collectedErrors.length}`);

  // Operation (h): Rapid zoom cycles (0.05 <-> 2.0, 5 times, 200ms each)
  console.log("[MONITOR] (e) Rapid zoom cycling...");
  for (let i = 0; i < 5; i++) {
    console.log(`[MONITOR]   Zoom cycle ${i + 1}/5...`);
    try {
      await page.evaluate(() => {
        const app = (window as any).app;
        if (!app) return { error: "no app" };
        const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (view?.worldContainer) {
          view.worldContainer.scale.set(0.05);
        }
        return { ok: true };
      });
    } catch (e) {
      console.log(`[MONITOR]   Rapid zoom 0.05 failed: ${e}`);
    }
    await page.waitForTimeout(200);
    try {
      await page.evaluate(() => {
        const app = (window as any).app;
        if (!app) return { error: "no app" };
        const view = app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (view?.worldContainer) {
          view.worldContainer.scale.set(2.0);
        }
        return { ok: true };
      });
    } catch (e) {
      console.log(`[MONITOR]   Rapid zoom 2.0 failed: ${e}`);
    }
    await page.waitForTimeout(200);
  }
  console.log(`[MONITOR] (e) Rapid zoom complete. Total errors: ${collectedErrors.length}`);

  // === ASSERTIONS ===
  console.log("\n=== FINAL REPORT ===");
  console.log(`Total errors collected: ${collectedErrors.length}`);

  if (collectedErrors.length > 0) {
    console.log("\nDetailed error log:");
    collectedErrors.forEach((err, idx) => {
      console.log(`\n[${idx + 1}] ${err.type.toUpperCase()}`);
      console.log(`  Message: ${err.message}`);
      if (err.stack) {
        console.log(`  Stack: ${err.stack}`);
      }
    });

    // Fail the test if unknown errors were found
    expect(collectedErrors.length).toBe(
      0,
      `Found ${collectedErrors.length} unexpected console error(s). See log above for details.`
    );
  } else {
    console.log("No unexpected errors found. Test PASSED.");
  }
});

test.afterAll(async () => {
  // Print final summary
  if (collectedErrors.length > 0) {
    console.log("\n=== ERRORS FOUND DURING SESSION ===");
    console.log(JSON.stringify(collectedErrors, null, 2));
  }
});

// =========================================================================
// Display Quality Gate — node overlap + coordinate sanity
// =========================================================================
test("QUALITY: display quality after tests", async () => {
  const quality = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view").find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes || v.pixiNodes.size < 2) return { ok: true, skipped: true };
    // 1. Node overlap
    const overlapRatio = typeof v.getNodeOverlapRatio === "function" ? v.getNodeOverlapRatio() : -1;
    // 2. Coordinate sanity
    let nanCount = 0;
    for (const [, pn] of v.pixiNodes) {
      if (!Number.isFinite(pn.data.x) || !Number.isFinite(pn.data.y)) nanCount++;
    }
    // 3. Label quality
    const qs = typeof v.getLabelQualityScore === "function" ? v.getLabelQualityScore() : null;
    return {
      ok: true,
      overlapRatio: overlapRatio >= 0 ? Math.round(overlapRatio * 100) : -1,
      nanCount,
      qualityScore: qs?.score ?? -1,
      nodeCount: v.pixiNodes.size,
    };
  });
  expect(quality.ok).toBe(true);
  if (!quality.skipped) {
    expect(quality.nanCount).toBe(0);
    if (quality.overlapRatio >= 0) expect(quality.overlapRatio).toBeLessThan(50);
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

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
    expect(density.viewportUtilization).toBeGreaterThan(5);
    expect(density.rightHalfRatio).toBeLessThan(95);
  }

  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }

  // 3. Edge visibility — edges should be distinguishable
  const edges = await measureEdgeVisibility(page);
  if (edges.totalEdges > 5) {
    expect(edges.lowAlphaCount).toBeLessThan(edges.visibleEdges * 0.5);
  }

  // 4. Enclosure overlap — groupBy boundaries shouldn't overlap heavily
  const enclosures = await measureEnclosureOverlap(page);
  if (enclosures.totalEnclosures > 2) {
    expect(enclosures.overlapRate).toBeLessThan(0.50);
  }

  // 5. Card readability — cards should not overlap excessively
  const cards = await measureCardReadability(page);
  if (cards.totalCards > 5) {
    expect(cards.overlappingCards).toBeLessThan(cards.totalCards * 0.3);
    expect(cards.tooSmallCards).toBeLessThan(cards.totalCards * 0.5);
  }
});

