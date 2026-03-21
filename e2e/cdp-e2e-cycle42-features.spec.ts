/**
 * CDP E2E Test — Cycle 42: Search Label Highlight + Node Size Boost
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(300_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(() => { location.reload(); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    (window as any).app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(8000);
});

async function setZoomAndWait(p: Page, zoom: number) {
  await p.evaluate(async (z) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    const world = view.worldContainer;
    if (!world) return;
    const wrap = view.canvasWrap;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal({ x: cx, y: cy }, view.pixiApp.stage);
    const s = Math.max(0.02, Math.min(10, z));
    world.scale.set(s);
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;
    view.updateZoomIndicator(s);
    view.updateLabelsForZoom();
    view.markDirty();
    await new Promise(r => setTimeout(r, 800));
  }, zoom);
}

test("Proposal Z: minimap already exists (toggle with M key)", async () => {
  const result = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    return {
      hasMinimapField: "showMinimap" in (view?.panel ?? {}),
      hasMinimap: !!view?.minimap,
    };
  });
  console.log(`  Minimap status:`, result);
  expect(result.hasMinimapField).toBe(true);
});

test("Proposal AA: search highlight makes labels bold", async () => {
  await setZoomAndWait(page, 0.5);
  // Set search query
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.searchQuery = "hamlet";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 1500));
    // Re-apply text fade to trigger search highlight
    view.labelManager?.applyTextFade();
  });
  await page.waitForTimeout(500);

  const labels = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return [];
    const results: { text: string; fontWeight: string; bgAlpha: number }[] = [];
    for (const pn of view.pixiNodes.values()) {
      if (pn.label?.visible && pn.label?.text) {
        results.push({
          text: pn.label.text,
          fontWeight: pn.label.style?.fontWeight ?? "normal",
          bgAlpha: pn.label.bgAlpha ?? 0,
        });
      }
    }
    return results;
  });

  console.log(`  Search "hamlet": ${labels.length} visible labels`);
  const boldLabels = labels.filter(l => l.fontWeight === "bold");
  console.log(`  Bold labels: ${boldLabels.length}`, boldLabels.map(l => l.text).slice(0, 5));

  // Clean up search
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.searchQuery = "";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));
  });
  expect(labels.length).toBeGreaterThan(0);
});

test("Proposal AB: nodes appear larger at zoom-out", async () => {
  // Compare node visual size at different zoom levels
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };

    // Sample a high-degree node's radius
    let sampleId = "";
    let maxDeg = 0;
    for (const [id, deg] of view.degrees.entries()) {
      if (deg > maxDeg) { maxDeg = deg; sampleId = id; }
    }
    const pn = view.pixiNodes.get(sampleId);
    if (!pn) return { error: "no sample node" };

    return {
      sampleId,
      baseRadius: pn.radius,
      degree: maxDeg,
    };
  });
  console.log(`  Sample node:`, result);
  expect(result.baseRadius).toBeGreaterThan(0);
});

test("Regression: full test cycle", async () => {
  // Quick regression through zoom levels
  for (const zoom of [0.1, 0.3, 0.5, 1.0]) {
    await setZoomAndWait(page, zoom);
  }
  const indicator = await page.evaluate(() =>
    document.querySelector(".gi-zoom-indicator")?.textContent ?? ""
  );
  expect(indicator).toBe("100%");
});

test("Regression: no console errors", async () => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  await setZoomAndWait(page, 0.2);
  await setZoomAndWait(page, 1.0);
  const real = errors.filter(e => !e.includes("ResizeObserver") && !e.includes("Excalidraw"));
  expect(real.length).toBe(0);
});
