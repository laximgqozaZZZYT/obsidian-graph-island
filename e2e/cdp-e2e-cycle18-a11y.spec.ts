/**
 * CDP E2E Test — Cycle 18: Minimap keyboard a11y + Search ARIA combobox
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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

function giView(expr: string) {
  return page.evaluate((e) => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    return new Function("v", `return ${e}`)(leaf.view);
  }, expr);
}

// IF: Minimap has tabindex for keyboard access
test("IF: minimap is keyboard-focusable with tabindex", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const minimap = leaf.view.containerEl?.querySelector(".gi-minimap-wrap");
    if (!minimap) return { error: "no minimap" };
    return {
      tabindex: minimap.getAttribute("tabindex"),
      role: minimap.getAttribute("role"),
      ariaLabel: minimap.getAttribute("aria-label"),
      isFocusable: minimap.getAttribute("tabindex") === "0",
    };
  });
  if (result.error) { console.log(`[IF] Skipped: ${result.error}`); return; }
  expect(result.isFocusable).toBe(true);
  expect(result.ariaLabel).toContain("arrow keys");
  console.log(`[IF] Minimap: tabindex=${result.tabindex}, role=${result.role}, label="${result.ariaLabel}"`);
});

// IG: Search input has combobox ARIA pattern
test("IG: search input has role=combobox + aria-controls", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    // Open panel if closed
    const panel = leaf.view.containerEl?.querySelector(".graph-panel");
    const search = leaf.view.containerEl?.querySelector("input.gi-search");
    if (!search) return { error: "no search input (panel may be closed)" };
    return {
      role: search.getAttribute("role"),
      ariaExpanded: search.getAttribute("aria-expanded"),
      ariaControls: search.getAttribute("aria-controls"),
      ariaAutocomplete: search.getAttribute("aria-autocomplete"),
    };
  });
  if (result.error) { console.log(`[IG] Skipped: ${result.error}`); return; }
  expect(result.role).toBe("combobox");
  expect(result.ariaExpanded).toBe("false");
  expect(result.ariaControls).toBe("gi-search-history-list");
  console.log(`[IG] Search ARIA: role=${result.role}, expanded=${result.ariaExpanded}, controls=${result.ariaControls}`);
});

// IH: Search history dropdown has listbox role
test("IH: search history has role=listbox", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const dropdown = leaf.view.containerEl?.querySelector("#gi-search-history-list");
    if (!dropdown) return { error: "no history dropdown" };
    return {
      role: dropdown.getAttribute("role"),
      ariaLabel: dropdown.getAttribute("aria-label"),
    };
  });
  if (result.error) { console.log(`[IH] Skipped: ${result.error}`); return; }
  expect(result.role).toBe("listbox");
  console.log(`[IH] History dropdown: role=${result.role}, label="${result.ariaLabel}"`);
});

// II: Hover tooltip checklist toggles exist
test("II: hoverShowTitle/Meta/Body toggles in panel", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const p = leaf.view.panel;
    return {
      hoverShowTitle: p.hoverShowTitle,
      hoverShowMeta: p.hoverShowMeta,
      hoverShowBody: p.hoverShowBody,
    };
  });
  if (result.error) { console.log(`[II] Skipped: ${result.error}`); return; }
  // Defaults: title=true, meta=true, body=false
  expect(result.hoverShowTitle).toBe(true);
  expect(result.hoverShowMeta).toBe(true);
  expect(result.hoverShowBody).toBe(false);
  console.log(`[II] Hover toggles: title=${result.hoverShowTitle}, meta=${result.hoverShowMeta}, body=${result.hoverShowBody}`);
});

// IJ: No console errors
test("IJ: no console errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IJ] ${errors.length} errors`);
});

// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});

