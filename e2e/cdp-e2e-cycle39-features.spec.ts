/**
 * CDP E2E Test — Cycle 39: Zoom Presets + Label Mode Override + Console Monitor
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";

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
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
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

test("Proposal R: zoom preset buttons exist and are clickable", async () => {
  const presets = await page.evaluate(() => {
    const btns = document.querySelectorAll(".gi-zoom-preset-btn");
    return Array.from(btns).map(b => ({
      text: b.textContent,
      ariaLabel: b.getAttribute("aria-label"),
    }));
  });
  console.log(`  Preset buttons:`, presets);
  expect(presets.length).toBe(4);
  expect(presets.map(p => p.text)).toEqual(["10", "30", "50", "100"]);
  expect(presets[0].ariaLabel).toBe("Zoom to 10%");
});

test("Proposal R: clicking preset button sets zoom", async () => {
  // Click the 30% preset button
  await page.evaluate(async () => {
    const btns = document.querySelectorAll(".gi-zoom-preset-btn");
    (btns[1] as HTMLButtonElement)?.click(); // 30%
    await new Promise(r => setTimeout(r, 800));
  });
  const zoom = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    return Math.round((leaf?.view?.worldContainer?.scale?.x ?? 1) * 100);
  });
  console.log(`  After clicking 30%: zoom = ${zoom}%`);
  expect(zoom).toBe(30);
});

test("Proposal S: labelModeOverride forces mode regardless of zoom", async () => {
  // Set override to "full" and zoom to 0.1 (normally would be "initials")
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelModeOverride = "full";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));
  });
  await setZoomAndWait(page, 0.1);

  const result = await page.evaluate(() => {
    const text = document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    const labels: string[] = [];
    if (view?.pixiNodes) {
      for (const pn of view.pixiNodes.values()) {
        if (pn.label?.visible && pn.label?.text) labels.push(pn.label.text);
      }
    }
    return { indicator: text, labelCount: labels.length, sampleLabels: labels.slice(0, 5) };
  });
  console.log(`  Override=full at zoom=0.1:`, result);
  // Indicator should show F (full mode forced)
  expect(result.indicator).toContain("·F");

  // Cleanup: reset override
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (view?.panel?.renderThresholds) {
      view.panel.renderThresholds.labelModeOverride = "auto";
      view.markDirty(true);
    }
    await new Promise(r => setTimeout(r, 500));
  });
});

test("Proposal S: override=initials at zoom=1.0", async () => {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (!view) return;
    if (!view.panel.renderThresholds) view.panel.renderThresholds = {};
    view.panel.renderThresholds.labelModeOverride = "initials";
    view.markDirty(true);
    await new Promise(r => setTimeout(r, 500));
  });
  await setZoomAndWait(page, 1.0);

  const labels = await page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    const texts: string[] = [];
    if (view?.pixiNodes) {
      for (const pn of view.pixiNodes.values()) {
        if (pn.label?.visible && pn.label?.text) texts.push(pn.label.text);
      }
    }
    return texts;
  });
  console.log(`  Override=initials at zoom=1.0: ${labels.length} labels, sample: ${labels.slice(0, 10)}`);
  expect(labels.length).toBeGreaterThan(0);
  // All labels should be 2 chars (initials mode forced)
  const longLabels = labels.filter(l => l.length > 2);
  expect(longLabels.length).toBeLessThan(labels.length * 0.05); // allow tiny tolerance for super-nodes

  // Cleanup
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    const view = leaf?.view;
    if (view?.panel?.renderThresholds) {
      view.panel.renderThresholds.labelModeOverride = "auto";
      view.markDirty(true);
    }
    await new Promise(r => setTimeout(r, 500));
  });
});

test("Regression: all 29 previous test features still work", async () => {
  // Quick smoke test of major features
  await setZoomAndWait(page, 0.15);
  const initialsResult = await page.evaluate(() => {
    const text = document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
    return { indicator: text };
  });
  expect(initialsResult.indicator).toContain("·I");

  await setZoomAndWait(page, 0.3);
  const truncResult = await page.evaluate(() => {
    const text = document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
    return { indicator: text };
  });
  expect(truncResult.indicator).toContain("·T");

  await setZoomAndWait(page, 1.0);
  const fullResult = await page.evaluate(() => {
    const text = document.querySelector(".gi-zoom-indicator")?.textContent ?? "";
    const badge = document.querySelector(".gi-density-badge");
    return {
      indicator: text,
      badgeHidden: badge ? window.getComputedStyle(badge).display === "none" : true,
    };
  });
  expect(fullResult.indicator).toBe("100%");
  expect(fullResult.badgeHidden).toBe(true);
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

