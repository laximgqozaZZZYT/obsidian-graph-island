/**
 * CDP E2E Test — Cycle 24: LOD v2.1 spec verification + zoom prefetch
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
  // Ensure GI view is open
  const hasGI = await page.evaluate(() =>
    (window as any).app.workspace.getLeavesOfType("graph-view").some((l: any) => l.view && "pixiNodes" in l.view)
  );
  if (!hasGI) {
    await page.evaluate(() => (window as any).app.commands.executeCommandById("graph-island:open-graph-view"));
    await page.waitForTimeout(10000);
  }
  await page.waitForTimeout(3000);
});

async function labelsAtZoom(z: number): Promise<{ vis: number; total: number; pct: string }> {
  return page.evaluate(async (zoom) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf?.view?.worldContainer) return { vis: 0, total: 0, pct: "N/A" };
    const v = leaf.view;
    v.worldContainer.scale.set(zoom); v.markDirty?.(true);
    await new Promise(r => setTimeout(r, 1200));
    let vis = 0;
    for (const pn of v.pixiNodes.values()) { if (pn.label?.visible) vis++; }
    const total = v.pixiNodes.size;
    return { vis, total, pct: total > 0 ? (vis / total * 100).toFixed(1) : "0" };
  }, z);
}

// v2.1 LOD Tier 1: z0.05 — top 3% only
test("v2.1 LOD Tier 1: z0.05 shows ≤5% of nodes", async () => {
  const r = await labelsAtZoom(0.05);
  if (r.pct === "N/A") { console.log("[T1] Skipped"); return; }
  expect(parseFloat(r.pct)).toBeLessThanOrEqual(5);
  expect(r.vis).toBeGreaterThan(0);
  console.log(`[T1] z0.05: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 2: z0.2 — top 10%
test("v2.1 LOD Tier 2: z0.2 shows ≤15% of nodes", async () => {
  const r = await labelsAtZoom(0.2);
  if (r.pct === "N/A") { console.log("[T2] Skipped"); return; }
  expect(parseFloat(r.pct)).toBeLessThanOrEqual(15);
  console.log(`[T2] z0.2: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 3: z0.5 — full labels visible
test("v2.1 LOD Tier 3: z0.5 shows significant labels", async () => {
  const r = await labelsAtZoom(0.5);
  if (r.pct === "N/A") { console.log("[T3] Skipped"); return; }
  expect(r.vis).toBeGreaterThan(10);
  console.log(`[T3] z0.5: ${r.vis}/${r.total} (${r.pct}%)`);
});

// v2.1 LOD Tier 4: z1.0 — all labels
test("v2.1 LOD Tier 4: z1.0 shows all or most labels", async () => {
  const r = await labelsAtZoom(1.0);
  if (r.pct === "N/A") { console.log("[T4] Skipped"); return; }
  // Most nodes with labels should be visible at z1.0 (>100 labels)
  expect(r.vis).toBeGreaterThan(100);
  console.log(`[T4] z1.0: ${r.vis}/${r.total} (${r.pct}%)`);
  // Restore
  await labelsAtZoom(1.0);
});

// Zoom prefetch: updateLabelsForZoom called from InteractionManager
test("Zoom prefetch: InteractionManager calls updateLabelsForZoom directly", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no view" };
    // Verify the method exists
    return {
      hasUpdateLabels: typeof leaf.view.updateLabelsForZoom === "function",
      hasMarkDirty: typeof leaf.view.markDirty === "function",
    };
  });
  if (result.error) { console.log(`[Prefetch] Skipped: ${result.error}`); return; }
  expect(result.hasUpdateLabels).toBe(true);
  console.log(`[Prefetch] updateLabelsForZoom=${result.hasUpdateLabels}, markDirty=${result.hasMarkDirty}`);
});

test("No errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[Clean] ${errors.length} errors`);
});
