/**
 * Phase 8 — tagDisplay (enclosure mode)
 * Verifies that tagDisplay="enclosure" produces 19 enclosure labels
 * and tag memberships total 2192.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

const CDP_URL = "http://localhost:9222";
test.setTimeout(120_000);

let browser: Browser;
let page: Page;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(60_000);
  browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  page = ctx.pages().find(p => p.url().includes("index.html")) ?? ctx.pages()[0];

  await page.evaluate(async () => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!v) return;
    v.panel.searchQuery = "";
    v.panel.showOrphans = true;
    v.panel.showTags = true;
    v.panel.tagDisplay = "enclosure";
    v.rawData = null;
    v.doRender();
  });
  await page.waitForTimeout(6000);
});

test.afterAll(async () => { /* shared session */ });

test.describe("Phase 8 — tagDisplay enclosure", () => {
  test("8-1: enclosure mode creates 19 tag labels", async () => {
    const labelCount = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership === "function") {
        return v.getTagMembership().size;
      }
      // Fallback: scan for Map<string, CanvasText>
      for (const k of Object.keys(v)) {
        const val = v[k];
        if (val instanceof Map && val.size > 0) {
          const first = val.values().next().value;
          if (first && typeof first === "object" && "text" in first && "style" in first) {
            return val.size;
          }
        }
      }
      return -1;
    });
    expect(labelCount).toBe(19);
  });

  test("8-2: enclosure mode has 2192 total tag memberships", async () => {
    const total = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      let sum = 0;
      for (const members of tm.values()) sum += members.size;
      return sum;
    });
    expect(total).toBe(2192);
  });

  test("8-3: tag:battle enclosure contains 80 members", async () => {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (typeof v?.getTagMembership !== "function") return -1;
      const tm = v.getTagMembership();
      const members = tm.get("battle") ?? tm.get("#battle");
      return members?.size ?? -1;
    });
    expect(count).toBe(80);
  });
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

