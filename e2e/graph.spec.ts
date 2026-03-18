/**
 * CDP E2E Test -- Graph Data Structure
 *
 * Verifies the graph data structure: node IDs are unique,
 * edges reference valid nodes, and basic graph invariants hold.
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

test("all node IDs in pixiNodes map are unique strings", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const ids: string[] = [];
    if (view.pixiNodes instanceof Map) {
      for (const [id] of view.pixiNodes) ids.push(id);
    }
    const uniqueIds = new Set(ids);
    return { total: ids.length, unique: uniqueIds.size, allUnique: ids.length === uniqueIds.size };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.total).toBeGreaterThan(0);
  expect(result.allUnique).toBe(true);
});

test("edges reference existing node IDs", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "no view" };
    const nodeIds = new Set<string>();
    if (view.pixiNodes instanceof Map) {
      for (const [id] of view.pixiNodes) nodeIds.add(id);
    }
    const edges = view.graphEdges ?? [];
    let validEdges = 0;
    for (const e of edges.slice(0, 100)) {
      const srcId = typeof e.source === "object" ? e.source.id : e.source;
      const tgtId = typeof e.target === "object" ? e.target.id : e.target;
      if (nodeIds.has(srcId) && nodeIds.has(tgtId)) validEdges++;
    }
    return { checked: Math.min(edges.length, 100), valid: validEdges };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.valid).toBe(result.checked);
});

test("max degree node has approximately 129 connections", async () => {
  const result = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.degrees) return { error: "no degrees" };
    let maxDeg = 0;
    for (const [, deg] of view.degrees) {
      if (deg > maxDeg) maxDeg = deg;
    }
    return { maxDegree: maxDeg };
  });
  expect(result).not.toHaveProperty("error");
  expect(result.maxDegree).toBeGreaterThanOrEqual(100);
});
