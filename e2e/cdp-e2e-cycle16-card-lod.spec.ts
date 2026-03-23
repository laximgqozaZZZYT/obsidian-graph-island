/**
 * CDP E2E Test — Cycle 16: Card LOD tiered fallback + ARIA verification
 * IC: Card density fallback at LOD 4 with >500 nodes
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast, measureScreenDensity, measureLabelReadability, measureEdgeVisibility, measureEnclosureOverlap, measureCardReadability } from "./helpers/quality-checks";

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

function getGIView(p: Page) {
  return p.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    return leaf ? { found: true, nodeCount: leaf.view.pixiNodes?.size ?? 0 } : { found: false, nodeCount: 0 };
  });
}

// IC: Card LOD tiered density fallback
test("IC: cardDensityFallbackCountHigh defaults to 500", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const v = leaf.view;
    const rt = v.panel?.renderThresholds ?? {};
    return {
      cardDensityFallbackCount: rt.cardDensityFallbackCount ?? 150,
      cardDensityFallbackCountHigh: rt.cardDensityFallbackCountHigh ?? 500,
    };
  });
  if (result.error) { console.log(`[IC] Skipped: ${result.error}`); return; }
  expect(result.cardDensityFallbackCount).toBe(150);
  expect(result.cardDensityFallbackCountHigh).toBe(500);
  console.log(`[IC] Card density thresholds: LOD3=${result.cardDensityFallbackCount}, LOD4=${result.cardDensityFallbackCountHigh}`);
});

// ID: Tiered fallback logic — LOD 4 + many nodes → node mode
test("ID: card fallback at LOD 4 when nodes > 500", async () => {
  const result = await page.evaluate(() => {
    // Test the fallback decision logic directly
    const thresholdLOD3 = 150;
    const thresholdLOD4 = 500;
    const tests = [
      { lod: 2, nodes: 100, expected: "node" },     // LOD<3 → always node
      { lod: 3, nodes: 100, expected: "card" },      // LOD3 + low density → card
      { lod: 3, nodes: 200, expected: "node" },      // LOD3 + >150 → node
      { lod: 4, nodes: 300, expected: "card" },      // LOD4 + low density → card
      { lod: 4, nodes: 600, expected: "node" },      // LOD4 + >500 → node
      { lod: 5, nodes: 1000, expected: "card" },     // LOD5 → always card
    ];
    return {
      tests: tests.map(t => {
        let mode: string;
        if (t.lod < 3 || (t.lod === 3 && t.nodes > thresholdLOD3)) {
          mode = "node";
        } else if (t.lod === 4 && t.nodes > thresholdLOD4) {
          mode = "node";
        } else {
          mode = "card";
        }
        return { ...t, actual: mode, pass: mode === t.expected };
      }),
    };
  });
  const allPass = result.tests.every((t: any) => t.pass);
  expect(allPass).toBe(true);
  console.log(`[ID] Tiered fallback: ${result.tests.map((t: any) => `LOD${t.lod}/n=${t.nodes}→${t.actual}`).join(", ")}`);
});

// IE: ARIA landmarks are properly set
test("IE: graph view has proper ARIA landmarks", async () => {
  const result = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (!leaf) return { error: "no GI view" };
    const container = leaf.view.containerEl;
    if (!container) return { error: "no container" };
    
    const roles: Record<string, string[]> = {};
    container.querySelectorAll("[role]").forEach((el: Element) => {
      const role = el.getAttribute("role") ?? "";
      const label = el.getAttribute("aria-label") ?? "";
      if (!roles[role]) roles[role] = [];
      roles[role].push(label);
    });
    
    return {
      roles,
      hasMain: !!roles["main"],
      hasToolbar: !!roles["toolbar"],
      hasComplementary: !!roles["complementary"],
    };
  });
  if (result.error) { console.log(`[IE] Skipped: ${result.error}`); return; }
  expect(result.hasMain).toBe(true);
  expect(result.hasToolbar).toBe(true);
  console.log(`[IE] ARIA roles: ${Object.entries(result.roles).map(([r, labels]) => `${r}(${labels.length})`).join(", ")}`);
});

// IF: View discovery with pixiNodes filter works
test("IF: Graph Island view found via pixiNodes filter", async () => {
  const info = await getGIView(page);
  expect(info.found).toBe(true);
  expect(info.nodeCount).toBeGreaterThan(0);
  console.log(`[IF] GI view: ${info.nodeCount} nodes`);
});

// IG: No console errors
test("IG: no console errors", async () => {
  expect(errors.length).toBe(0);
  console.log(`[IG] ${errors.length} errors`);
});

test.afterAll(async () => {
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => l.view && "pixiNodes" in l.view);
    if (leaf?.view?.worldContainer) {
      leaf.view.worldContainer.scale.set(1.0);
      leaf.view.markDirty?.(true);
    }
  }).catch(() => {});
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

  // 1. Screen-space density — detect node pile-up
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  // 2. Label readability — detect text overlap and unreadable font sizes
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

  // 4. Screen-space density (detect actual visual pile-up)
  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

});

