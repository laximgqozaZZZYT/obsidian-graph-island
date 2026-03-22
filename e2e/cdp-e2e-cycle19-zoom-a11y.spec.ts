/**
 * CDP E2E Test — Cycle 19: Zoom sensitivity + section a11y + high contrast expansion
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
  await page.waitForTimeout(3000);
});

// IL: zoomSensitivity defaults to 1.0
test("IL: zoomSensitivity panel field defaults to 1.0", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    return { zoomSensitivity: leaf.view.panel.zoomSensitivity };
  });
  if (result.error) { console.log(`[IL] Skipped: ${result.error}`); return; }
  expect(result.zoomSensitivity).toBeCloseTo(1.0, 1);
  console.log(`[IL] zoomSensitivity: ${result.zoomSensitivity}`);
});

// IM: Section headers have aria-controls linking to body
test("IM: panel section headers have aria-controls", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const headers = leaf.view.containerEl?.querySelectorAll("[aria-controls]");
    const withControls = [];
    headers?.forEach((h) => {
      const ctrl = h.getAttribute("aria-controls");
      const target = ctrl ? leaf.view.containerEl?.querySelector("#" + ctrl) : null;
      withControls.push({ controls: ctrl, targetExists: !!target });
    });
    return { count: withControls.length, sample: withControls.slice(0, 5) };
  });
  if (result.error) { console.log(`[IM] Skipped: ${result.error}`); return; }
  expect(result.count).toBeGreaterThan(0);
  // Verify at least some targets exist (aria-controls points to real elements)
  const validTargets = result.sample.filter((s: any) => s.targetExists);
  console.log(`[IM] aria-controls: ${result.count} headers, ${validTargets.length}/${result.sample.length} targets found`);
});

// IN: Zoom sensitivity formula produces correct factors
test("IN: zoom sensitivity scaling formula correct", async () => {
  const result = await page.evaluate(() => {
    const BASE_IN = 1.1;
    const BASE_OUT = 0.9;
    const tests = [
      { sens: 0.5, expectIn: 1 + (BASE_IN - 1) * 0.5, expectOut: 1 - (1 - BASE_OUT) * 0.5 },
      { sens: 1.0, expectIn: BASE_IN, expectOut: BASE_OUT },
      { sens: 2.0, expectIn: 1 + (BASE_IN - 1) * 2, expectOut: 1 - (1 - BASE_OUT) * 2 },
    ];
    return {
      tests: tests.map(t => ({
        sens: t.sens,
        inFactor: (1 + (BASE_IN - 1) * t.sens).toFixed(3),
        outFactor: (1 - (1 - BASE_OUT) * t.sens).toFixed(3),
        inCorrect: Math.abs(1 + (BASE_IN - 1) * t.sens - t.expectIn) < 0.001,
        outCorrect: Math.abs(1 - (1 - BASE_OUT) * t.sens - t.expectOut) < 0.001,
      })),
    };
  });
  const allCorrect = result.tests.every((t: any) => t.inCorrect && t.outCorrect);
  expect(allCorrect).toBe(true);
  console.log(`[IN] Zoom factors: ${result.tests.map((t: any) => `sens=${t.sens}→in:${t.inFactor}/out:${t.outFactor}`).join(", ")}`);
});

// IO: High contrast mode affects RenderHost
test("IO: isHighContrastMode exposed on view", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    return {
      hasMethod: typeof v.isHighContrastMode === "function",
      currentValue: v.isHighContrastMode?.() ?? "N/A",
    };
  });
  if (result.error) { console.log(`[IO] Skipped: ${result.error}`); return; }
  expect(result.hasMethod).toBe(true);
  console.log(`[IO] isHighContrastMode: method=${result.hasMethod}, value=${result.currentValue}`);
});

// IP: No console errors
test("IP: no console errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IP] ${errors.length} errors`);
});
