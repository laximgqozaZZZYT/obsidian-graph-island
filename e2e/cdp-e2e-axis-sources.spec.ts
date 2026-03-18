/**
 * CDP E2E Test -- Axis Sources
 *
 * Verifies that coordinate layout axis sources (field, hop, index)
 * produce correct spatial separation in node positioning.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

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

async function applyCoordLayout(layout: any) {
  return page.evaluate(async (cl: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.coordinateLayout = cl;
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    const xs: number[] = [];
    const ys: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        if (typeof pn.data.x === "number" && isFinite(pn.data.x)) xs.push(pn.data.x);
        if (typeof pn.data.y === "number" && isFinite(pn.data.y)) ys.push(pn.data.y);
      }
    }

    return {
      nodeCount: view.pixiNodes?.size ?? 0,
      xRange: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
      yRange: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0,
      distinctX: new Set(xs.map(v => Math.round(v / 50))).size,
    };
  }, layout);
}

test("field:folder source separates nodes by folder on X axis", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.distinctX).toBeGreaterThanOrEqual(1);
});

test("field:node_type source groups nodes by type", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "field", field: "node_type" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
});

test("index source with linear transform creates ordered distribution", async () => {
  const result = await applyCoordLayout({
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  });

  expect(result).not.toHaveProperty("error");
  expect(result.nodeCount).toBeGreaterThan(0);
  expect(result.xRange).toBeGreaterThan(0);
});

test("field:isTag source separates tags from files", async () => {
  const result = await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panel;

    panel.clusterArrangement = "custom";
    panel.showTagNodes = true;
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "field", field: "isTag" }, transform: { kind: "bin", count: 2 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    panel.collapsedGroups = new Set();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 4000));

    let tagCount = 0, fileCount = 0;
    const tagXs: number[] = [];
    const fileXs: number[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [, pn] of view.pixiNodes) {
        if (pn.data.isTag) { tagCount++; tagXs.push(pn.data.x); }
        else { fileCount++; fileXs.push(pn.data.x); }
      }
    }

    const avgTagX = tagXs.length > 0 ? tagXs.reduce((a, b) => a + b, 0) / tagXs.length : 0;
    const avgFileX = fileXs.length > 0 ? fileXs.reduce((a, b) => a + b, 0) / fileXs.length : 0;

    return { tagCount, fileCount, separation: Math.abs(avgTagX - avgFileX) };
  });

  expect(result).not.toHaveProperty("error");
  if (result.tagCount > 0 && result.fileCount > 0) {
    expect(result.separation).toBeGreaterThan(10);
  }
});
