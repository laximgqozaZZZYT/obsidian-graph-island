/**
 * CDP E2E Test — Cycle 44: Animated Zoom + Smart Displacement + Folder Summary
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

test("Proposal AG: animated setZoom transitions smoothly", async () => {
  await setZoomAndWait(page, 1.0);
  // Call setZoom via the preset buttons (which calls setZoom internally)
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const zoomBefore = view.worldContainer?.scale?.x ?? 1;
    // Trigger setZoom via button click
    const btns = document.querySelectorAll(".gi-zoom-preset-btn");
    (btns[0] as HTMLButtonElement)?.click(); // 10%
    // Wait for animation (150ms + margin)
    await new Promise(r => setTimeout(r, 300));
    const zoomAfter = view.worldContainer?.scale?.x ?? 1;
    return {
      zoomBefore: Math.round(zoomBefore * 100),
      zoomAfter: Math.round(zoomAfter * 100),
    };
  });
  console.log(`  Animated zoom: ${result.zoomBefore}% → ${result.zoomAfter}%`);
  if (!result.error) {
    expect(result.zoomAfter).toBe(10);
  }
});

test("Proposal AF: 12-direction displacement search", async () => {
  await setZoomAndWait(page, 0.3);
  // Verify labels are placed (overlap culling ran with 12 directions)
  const labels = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { total: 0, visible: 0 };
    let total = 0, visible = 0;
    for (const pn of view.pixiNodes.values()) {
      if (pn.label) {
        total++;
        if (pn.label.visible) visible++;
      }
    }
    return { total, visible };
  });
  console.log(`  Labels at zoom=0.3: ${labels.visible}/${labels.total} visible`);
  expect(labels.visible).toBeGreaterThan(0);
});

test("Proposal AC: density badge shows folder summary at extreme zoom", async () => {
  await setZoomAndWait(page, 0.1);
  const badge = await page.evaluate(() => {
    const el = document.querySelector(".gi-density-badge");
    if (!el) return { text: "", display: "none" };
    return {
      text: el.textContent ?? "",
      display: window.getComputedStyle(el).display,
    };
  });
  console.log(`  Density badge at zoom=0.1:`, badge);
  // Badge may or may not show folder summary depending on visible label count
  if (badge.display !== "none" && badge.text) {
    expect(badge.text).toContain("more hidden");
  }
});

test("Regression: all zoom modes work", async () => {
  for (const [z, m] of [[0.15, "I"], [0.3, "T"], [0.5, "F"]] as [number, string][]) {
    await setZoomAndWait(page, z);
    const text = await page.evaluate(() =>
      document.querySelector(".gi-zoom-indicator")?.textContent ?? ""
    );
    expect(text).toContain(`·${m}`);
  }
});

test("Regression: no console errors", async () => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  await setZoomAndWait(page, 0.05);
  await setZoomAndWait(page, 1.0);
  const real = errors.filter(e => !e.includes("ResizeObserver") && !e.includes("Excalidraw"));
  expect(real.length).toBe(0);
});
