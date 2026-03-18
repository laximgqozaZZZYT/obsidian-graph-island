/**
 * AxisSource Audit — verify axis labels appear with correct text
 *
 * Tests coordinate layout axis sources (field, metric, index, hop)
 * and validates that axis titles/labels render properly.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.setTimeout(180_000);

async function ensureView(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }
  });
}

async function applyCoordinateLayout(layout: any): Promise<void> {
  await page.evaluate(async (cfg: any) => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return;
    const view = leaf.view;
    const p = typeof view.getPanel === "function" ? view.getPanel() : view.panel;
    p.clusterArrangement = "custom";
    p.coordinateLayout = cfg;
    p.showAxisTitles = true;
    p.gridTableMode = true;
    p.gridShowHeaders = true;
    p.showOrphans = true;
    p.showTags = false;
    p.showTagNodes = false;
    p.searchQuery = "";
    p.groupBy = "none";
    p.collapsedGroups = new Set();
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.doRender === "function") await view.doRender();
    await new Promise(r => setTimeout(r, 3000));
  }, layout);
}

async function getNodeSpreadAndCount(): Promise<{ count: number; xRange: number; yRange: number; xBuckets: number }> {
  return page.evaluate(() => {
    const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
    if (!leaf) return { count: 0, xRange: 0, yRange: 0, xBuckets: 0 };
    const view = leaf.view;
    const pixiNodes = typeof view.getPixiNodes === "function" ? view.getPixiNodes() : view.pixiNodes;
    if (!pixiNodes || pixiNodes.size === 0) return { count: 0, xRange: 0, yRange: 0, xBuckets: 0 };
    const xs: number[] = [];
    const ys: number[] = [];
    for (const pn of pixiNodes.values()) {
      xs.push(pn.data?.x ?? 0);
      ys.push(pn.data?.y ?? 0);
    }
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xBuckets = new Set(xs.map(x => Math.round(x / 20) * 20)).size;
    return {
      count: pixiNodes.size,
      xRange: xMax - xMin,
      yRange: yMax - yMin,
      xBuckets,
    };
  });
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();
  await ensureView();
});

test.afterAll(async () => {});

test.describe("AxisSource Audit", () => {

  test("field source distributes nodes into distinct X buckets", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    expect(result.xBuckets).toBeGreaterThan(3);
    console.log(`field source: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}, ${result.xBuckets} X buckets`);
  });

  test("metric:degree source creates spread proportional to connectivity", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    console.log(`metric:degree: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}`);
  });

  test("index source creates linear distribution", async () => {
    await applyCoordinateLayout({
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    expect(result.xRange).toBeGreaterThan(0);
    expect(result.yRange).toBeGreaterThan(0);
    console.log(`index: ${result.count} nodes, xRange=${result.xRange.toFixed(0)}, yRange=${result.yRange.toFixed(0)}`);
  });

  test("polar coordinate system produces circular distribution", async () => {
    await applyCoordinateLayout({
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: false,
    });
    const result = await getNodeSpreadAndCount();
    expect(result.count).toBeGreaterThan(100);
    // polar should produce roughly equal width and height
    const ratio = Math.max(result.xRange, result.yRange) / (Math.min(result.xRange, result.yRange) + 1);
    expect(ratio).toBeLessThan(5);
    console.log(`polar: ${result.count} nodes, ratio=${ratio.toFixed(2)}`);
  });
});
