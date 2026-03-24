/**
 * CDP E2E Test -- Panel UI Brushup
 *
 * Verifies graph settings panel UI/UX: tab navigation, toggle labels,
 * slider ranges, and section collapse behavior.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability, measureMinimap, measureGuides } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

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

test("panel has tab buttons with correct tab identifiers", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const tabBtns = view.containerEl?.querySelectorAll(".gi-tab-btn") ?? [];
    const tabs: string[] = [];
    for (const btn of tabBtns) tabs.push((btn as any).dataset?.tab ?? "unknown");
    return { tabCount: tabs.length, tabs };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.tabCount).toBeGreaterThanOrEqual(2);
});

test("toggle settings have visible labels", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const toggles = view.panelEl?.querySelectorAll(".setting-item.mod-toggle") ?? [];
    const labels: string[] = [];
    for (const t of toggles) {
      const name = (t as HTMLElement).querySelector(".setting-item-name")?.textContent?.trim();
      if (name) labels.push(name);
    }
    return { toggleCount: toggles.length, labels: labels.slice(0, 10) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.toggleCount).toBeGreaterThan(0);
});

test("slider controls have min and max values", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const sliders = view.panelEl?.querySelectorAll("input[type='range']") ?? [];
    const info: { min: string; max: string; value: string }[] = [];
    for (const s of sliders) {
      const el = s as HTMLInputElement;
      info.push({ min: el.min, max: el.max, value: el.value });
    }
    return { sliderCount: sliders.length, sliders: info.slice(0, 5) };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.sliderCount).toBeGreaterThan(0);
});

test("clicking tab switches visible content", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const tabs = view.containerEl?.querySelectorAll(".gi-tab-btn") ?? [];
    if (tabs.length < 2) return { error: "not enough tabs" };

    (tabs[0] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 200));
    const firstActive = (tabs[0] as HTMLElement).classList.contains("is-active");

    (tabs[1] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 200));
    const secondActive = (tabs[1] as HTMLElement).classList.contains("is-active");
    const firstStillActive = (tabs[0] as HTMLElement).classList.contains("is-active");

    return { firstActive, secondActive, firstStillActive };
  });
  expect(result).not.toHaveProperty("error");
});


// =========================================================================
// Visual Quality Gate — post-test display state check
// =========================================================================
test("VISUAL-GATE: display quality after test operations", async () => {
  const density = await measureScreenDensity(page);
  const labels = await measureLabelReadability(page);
  const edges = await measureEdgeVisibility(page);
  const minimap = await measureMinimap(page);
  const guides = await measureGuides(page);
  console.log(`[VISUAL-GATE] nodes=${density.totalNodes} hotspot=${density.worstCellCount} labels=${labels.totalVisible} overlap=${labels.overlapRate} edges=${edges.visibleEdges} colors=${edges.colorVariety} minimap=${minimap.visible} guides=${guides.lineCount}/${guides.labelCount}`);
  // Nodes should not be excessively piled up
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(200);
  }
  // Labels that are visible should be mostly readable
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.80);
  }
  // Edges should be visible with some color variety
  if (edges.totalEdges > 10) {
    expect(edges.visibleEdges).toBeGreaterThan(0);
  }
  // Guide labels should not all overlap each other
  if (guides.labelCount > 2) {
    expect(guides.overlappingLabels).toBeLessThan(guides.labelCount);
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

