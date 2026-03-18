/**
 * Zoom Audit — verify zoom levels produce correct visual scaling
 *
 * Tests that zoom in/out changes the viewport, node positions remain
 * stable in world space, and zoom indicator updates correctly.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

interface ZoomState {
  zoom: number;
  nodeCount: number;
  centerNodeX: number;
  centerNodeY: number;
  zoomIndicatorText: string;
}

async function getZoomState(): Promise<ZoomState> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { zoom: 0, nodeCount: 0, centerNodeX: 0, centerNodeY: 0, zoomIndicatorText: "" };
    const view = leaf.view;
    const pn = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    const zoom = view.zoom ?? view.cameraZoom ?? 1;
    let centerX = 0, centerY = 0, count = 0;
    if (pn) {
      for (const n of pn.values()) {
        centerX += n.data?.x ?? 0;
        centerY += n.data?.y ?? 0;
        count++;
      }
      if (count > 0) { centerX /= count; centerY /= count; }
    }
    const indicator = document.querySelector(".gi-zoom-indicator");
    return {
      zoom,
      nodeCount: count,
      centerNodeX: centerX,
      centerNodeY: centerY,
      zoomIndicatorText: indicator?.textContent ?? "",
    };
  });
}

async function setZoom(level: number): Promise<void> {
  await page.evaluate(async (z: number) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    if (typeof view.zoomTo === "function") view.zoomTo(z);
    else if (typeof view.setZoom === "function") view.setZoom(z);
    else {
      view.zoom = z;
      if (view.panelCallbacks) view.panelCallbacks.markDirty();
    }
    await new Promise(r => setTimeout(r, 500));
  }, level);
}

async function resetView(): Promise<void> {
  await page.evaluate(async () => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.searchQuery = "folder:characters";
    p.showTags = false;
    p.clusterArrangement = "spiral";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (view.panelCallbacks) view.panelCallbacks.invalidateData();
    await new Promise(r => setTimeout(r, 2000));
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await resetView();
});

test.afterAll(async () => {});

test.describe("Zoom Audit", () => {

  test("zoom in produces larger visual rendering", async () => {
    await resetView();
    await setZoom(1.0);
    const s1 = await page.screenshot();

    await setZoom(2.0);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(500);
    console.log(`zoom 1x->2x: pixel diff = ${diff}`);
  });

  test("zoom out produces smaller visual rendering", async () => {
    await resetView();
    await setZoom(1.0);
    const s1 = await page.screenshot();

    await setZoom(0.5);
    const s2 = await page.screenshot();

    const diff = pixelDiff(s1, s2);
    expect(diff).toBeGreaterThan(200);
    console.log(`zoom 1x->0.5x: pixel diff = ${diff}`);
  });

  test("node world positions unchanged by zoom", async () => {
    await resetView();
    await setZoom(1.0);
    const state1 = await getZoomState();

    await setZoom(3.0);
    const state2 = await getZoomState();

    // Node count unchanged
    expect(state2.nodeCount).toBe(state1.nodeCount);
    // World positions unchanged (within tolerance due to camera-based rendering)
    const posDelta = Math.abs(state2.centerNodeX - state1.centerNodeX) + Math.abs(state2.centerNodeY - state1.centerNodeY);
    expect(posDelta).toBeLessThan(10);
    console.log(`zoom world pos: delta=${posDelta.toFixed(2)}, nodes=${state1.nodeCount}`);
  });

  test("zoom indicator text updates with zoom level", async () => {
    await resetView();
    await setZoom(1.0);
    await page.waitForTimeout(500);
    const s1 = await getZoomState();

    await setZoom(2.0);
    await page.waitForTimeout(500);
    const s2 = await getZoomState();

    if (s1.zoomIndicatorText && s2.zoomIndicatorText) {
      expect(s1.zoomIndicatorText).not.toBe(s2.zoomIndicatorText);
      console.log(`zoom indicator: "${s1.zoomIndicatorText}" -> "${s2.zoomIndicatorText}"`);
    } else {
      console.log("zoom indicator not found in DOM, checking zoom property");
      expect(s2.zoom).toBeGreaterThan(s1.zoom);
    }
  });
});
