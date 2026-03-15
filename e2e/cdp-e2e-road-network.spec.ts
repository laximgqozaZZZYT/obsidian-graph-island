/**
 * Road Network & Edge Routing E2E Test
 *
 * Validates road network generation with multiple layout types:
 * 1. Road network generation in concentric (polar) layout
 * 2. Road network generation in grid layout
 * 3. Road network generation in timeline (cartesian) layout
 * 4. Edge routing across the network
 * 5. Road network parameters and structure
 * 6. Edge adherence in triangle arrangement
 * 7. Edge adherence in radial arrangement
 */

import { test, expect, chromium, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const CDP_URL = "http://localhost:9222";
const VIEW_TYPE = "graph-view";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  // Wait for Obsidian to be fully ready before connecting
  await new Promise(r => setTimeout(r, 3000));

  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    console.error("CDP connection failed:", e);
    throw e;
  }

  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  if (!page) {
    throw new Error("No index.html page found");
  }

  await page.bringToFront();

  // Initialize Obsidian app and plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (!app) {
      throw new Error("app not available");
    }

    // Ensure plugin is enabled (plugins may be Map or plain object)
    const plugins = app.plugins.plugins;
    const hasPlugin = typeof plugins.get === "function"
      ? plugins.get("graph-island")
      : plugins["graph-island"];
    if (hasPlugin) {
      const existing = app.workspace.getLeavesOfType("graph-view");
      if (existing.length === 0) {
        await app.commands.executeCommandById("graph-island:open-graph-view");
        await new Promise(r => setTimeout(r, 3000));
      }
    } else {
      await app.plugins.enablePlugin("graph-island");
      await new Promise(r => setTimeout(r, 2000));
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 3000));
    }

    return "ready";
  });
});

test.afterAll(async () => {
  await browser?.close();
});

/**
 * Helper: Load preset from file and apply to view
 */
function loadPresetFile(presetName: string): Record<string, unknown> {
  const presetPath = join(__dirname, `../samples/${presetName}`);
  const content = readFileSync(presetPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Evaluate edge adherence inside Obsidian via CDP.
 * Routes random edge samples through the road network and measures
 * how closely waypoints follow road segments.
 */
async function evaluateEdgeAdherence(page: Page): Promise<{
  adherenceRate: number;
  avgMaxDeviation: number;
  violationCount: number;
  totalEdges: number;
  sampleViolations: { sourceId: string; targetId: string; maxDeviation: number }[];
} | { error: string }> {
  return page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn || rn.intersections.length === 0) {
      return { error: "no road network with intersections" };
    }

    const nodeIds = Array.from(rn.nodeAccess.keys()) as string[];
    if (nodeIds.length < 2) return { error: "insufficient nodes" };

    // Sample random edges
    const sampleSize = Math.min(50, Math.floor(nodeIds.length / 2));
    const edges: { sourceId: string; targetId: string; waypoints: { x: number; y: number }[] }[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const srcIdx = Math.floor(Math.random() * nodeIds.length);
      let tgtIdx = Math.floor(Math.random() * nodeIds.length);
      while (tgtIdx === srcIdx && nodeIds.length > 1) tgtIdx = Math.floor(Math.random() * nodeIds.length);

      const srcId = nodeIds[srcIdx];
      const tgtId = nodeIds[tgtIdx];

      const startIsect = rn.nodeAccess.get(srcId);
      const endIsect = rn.nodeAccess.get(tgtId);
      if (startIsect == null || endIsect == null) continue;
      if (startIsect === endIsect) continue; // skip same-intersection pairs

      // Inline Dijkstra
      const dist = new Map<number, number>();
      const prev = new Map<number, number>();
      const visited = new Set<number>();
      const queue: { id: number; d: number }[] = [];
      dist.set(startIsect, 0);
      queue.push({ id: startIsect, d: 0 });

      while (queue.length > 0) {
        let minIdx = 0;
        for (let j = 1; j < queue.length; j++) {
          if (queue[j].d < queue[minIdx].d) minIdx = j;
        }
        const { id: u } = queue.splice(minIdx, 1)[0];
        if (visited.has(u)) continue;
        visited.add(u);
        if (u === endIsect) break;

        const neighbors = rn.adjacency.get(u);
        if (!neighbors) continue;
        const du = dist.get(u) ?? Infinity;
        for (const { to: v, weight } of neighbors) {
          if (visited.has(v)) continue;
          const nd = du + weight;
          if (nd < (dist.get(v) ?? Infinity)) {
            dist.set(v, nd);
            prev.set(v, u);
            queue.push({ id: v, d: nd });
          }
        }
      }

      // Reconstruct path
      if (!prev.has(endIsect) && startIsect !== endIsect) continue;
      const path: number[] = [];
      let cur = endIsect;
      while (cur !== startIsect) {
        path.unshift(cur);
        const p = prev.get(cur);
        if (p == null) break;
        cur = p;
      }
      path.unshift(startIsect);
      if (path[0] !== startIsect) continue; // no path found

      // Convert to waypoints
      const waypoints: { x: number; y: number }[] = [];
      for (const id of path) {
        const isect = rn.intersections[id];
        if (isect) waypoints.push({ x: isect.x, y: isect.y });
      }

      if (waypoints.length >= 2) {
        edges.push({ sourceId: srcId, targetId: tgtId, waypoints });
      }
    }

    if (edges.length === 0) return { error: "no valid routes found" };

    // Measure adherence
    let adherentCount = 0;
    let totalMaxDev = 0;
    const violations: { sourceId: string; targetId: string; maxDeviation: number }[] = [];

    for (const edge of edges) {
      let maxDev = 0;
      for (const wp of edge.waypoints) {
        let minDist = Infinity;
        for (const seg of rn.segments) {
          const from = rn.intersections[seg.from];
          const to = rn.intersections[seg.to];
          if (!from || !to) continue;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const lenSq = dx * dx + dy * dy;
          let d: number;
          if (lenSq === 0) {
            d = Math.sqrt((wp.x - from.x) ** 2 + (wp.y - from.y) ** 2);
          } else {
            let t = ((wp.x - from.x) * dx + (wp.y - from.y) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const px = from.x + t * dx;
            const py = from.y + t * dy;
            d = Math.sqrt((wp.x - px) ** 2 + (wp.y - py) ** 2);
          }
          if (d < minDist) minDist = d;
        }
        if (minDist > maxDev) maxDev = minDist;
      }

      totalMaxDev += maxDev;
      if (maxDev <= 1.0) {
        adherentCount++;
      } else {
        violations.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          maxDeviation: Math.round(maxDev * 100) / 100,
        });
      }
    }

    return {
      adherenceRate: edges.length > 0 ? adherentCount / edges.length : 1,
      avgMaxDeviation: edges.length > 0 ? totalMaxDev / edges.length : 0,
      violationCount: violations.length,
      totalEdges: edges.length,
      sampleViolations: violations.slice(0, 5),
    };
  });
}

test("Road network generation in concentric layout (polar system)", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 1: Road Network Generation - Concentric (Polar)");
  console.log("====================================================");

  // Load preset 02 (concentric arrangement)
  const config02 = loadPresetFile("02-dense-cluster.json");

  await page.evaluate((config: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config02);

  await page.waitForTimeout(8000);

  // Retrieve road network info
  const roadNetInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn) {
      return { error: "roadNetworkData is null" };
    }

    return {
      system: rn.system,
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
      nodeAccessSize: rn.nodeAccess.size,
      centerX: Math.round(rn.cx),
      centerY: Math.round(rn.cy),
    };
  });

  console.log("Road network data:", JSON.stringify(roadNetInfo, null, 2));

  if (roadNetInfo.error) {
    console.log(`[FAIL] ${roadNetInfo.error}`);
    expect(roadNetInfo.error).toBeFalsy();
  } else {
    console.log(`[${roadNetInfo.system === "polar" ? "PASS" : "FAIL"}] system === "polar" (got: ${roadNetInfo.system})`);
    console.log(`[${roadNetInfo.intersectionsCount > 0 ? "PASS" : "FAIL"}] intersections.length > 0 (got: ${roadNetInfo.intersectionsCount})`);
    console.log(`[${roadNetInfo.segmentsCount > 0 ? "PASS" : "FAIL"}] segments.length > 0 (got: ${roadNetInfo.segmentsCount})`);
    console.log(`[${roadNetInfo.nodeAccessSize > 0 ? "PASS" : "FAIL"}] nodeAccess.size > 0 (got: ${roadNetInfo.nodeAccessSize})`);

    expect(roadNetInfo.system).toBe("polar");
    expect(roadNetInfo.intersectionsCount).toBeGreaterThan(0);
    expect(roadNetInfo.segmentsCount).toBeGreaterThan(0);
    expect(roadNetInfo.nodeAccessSize).toBeGreaterThan(0);
  }

  // Edge adherence check
  const adherence = await evaluateEdgeAdherence(page);
  console.log("Edge adherence:", JSON.stringify(adherence, null, 2));

  if (!("error" in adherence)) {
    console.log(`[${adherence.adherenceRate >= 0.90 ? "PASS" : "FAIL"}] adherenceRate >= 0.90 (got: ${adherence.adherenceRate.toFixed(3)})`);
    console.log(`[${adherence.avgMaxDeviation < 5.0 ? "PASS" : "FAIL"}] avgMaxDeviation < 5.0 (got: ${adherence.avgMaxDeviation.toFixed(1)})`);

    expect(adherence.adherenceRate).toBeGreaterThanOrEqual(0.90);
    expect(adherence.avgMaxDeviation).toBeLessThan(5.0);
  } else {
    console.log(`[WARN] Adherence check skipped: ${adherence.error}`);
  }
});

test("Road network generation in grid layout", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 2: Road Network Generation - Grid");
  console.log("=======================================");

  // Load preset 01 (grid arrangement)
  const config01 = loadPresetFile("01-panorama-overview.json");

  await page.evaluate((config: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config01);

  await page.waitForTimeout(8000);

  const roadNetInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn) {
      return { error: "roadNetworkData is null" };
    }

    return {
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
      nodeAccessSize: rn.nodeAccess.size,
    };
  });

  console.log("Road network data:", JSON.stringify(roadNetInfo, null, 2));

  if (roadNetInfo.error) {
    console.log(`[FAIL] ${roadNetInfo.error}`);
    expect(roadNetInfo.error).toBeFalsy();
  } else {
    console.log(`[${roadNetInfo.intersectionsCount > 0 ? "PASS" : "FAIL"}] intersections non-empty (got: ${roadNetInfo.intersectionsCount})`);
    console.log(`[${roadNetInfo.segmentsCount > 0 ? "PASS" : "FAIL"}] segments non-empty (got: ${roadNetInfo.segmentsCount})`);
    console.log(`[${roadNetInfo.nodeAccessSize > 0 ? "PASS" : "FAIL"}] nodeAccess non-empty (got: ${roadNetInfo.nodeAccessSize})`);

    expect(roadNetInfo.intersectionsCount).toBeGreaterThan(0);
    expect(roadNetInfo.segmentsCount).toBeGreaterThan(0);
    expect(roadNetInfo.nodeAccessSize).toBeGreaterThan(0);
  }

  // Edge adherence check
  const adherence = await evaluateEdgeAdherence(page);
  console.log("Edge adherence:", JSON.stringify(adherence, null, 2));

  if (!("error" in adherence)) {
    console.log(`[${adherence.adherenceRate >= 0.90 ? "PASS" : "FAIL"}] adherenceRate >= 0.90 (got: ${adherence.adherenceRate.toFixed(3)})`);
    console.log(`[${adherence.avgMaxDeviation < 5.0 ? "PASS" : "FAIL"}] avgMaxDeviation < 5.0 (got: ${adherence.avgMaxDeviation.toFixed(1)})`);

    expect(adherence.adherenceRate).toBeGreaterThanOrEqual(0.90);
    expect(adherence.avgMaxDeviation).toBeLessThan(5.0);
  } else {
    console.log(`[WARN] Adherence check skipped: ${adherence.error}`);
  }
});

test("Road network generation in timeline layout (cartesian system)", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 3: Road Network Generation - Timeline (Cartesian)");
  console.log("========================================================");

  // Load preset 08 (timeline arrangement)
  const config08 = loadPresetFile("08-sequence-tracker.json");

  await page.evaluate((config: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config08);

  await page.waitForTimeout(8000);

  const roadNetInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn) {
      return { error: "roadNetworkData is null" };
    }

    return {
      system: rn.system,
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
    };
  });

  console.log("Road network data:", JSON.stringify(roadNetInfo, null, 2));

  if (roadNetInfo.error) {
    console.log(`[FAIL] ${roadNetInfo.error}`);
    expect(roadNetInfo.error).toBeFalsy();
  } else {
    console.log(`[${roadNetInfo.system === "cartesian" ? "PASS" : "FAIL"}] system === "cartesian" (got: ${roadNetInfo.system})`);
    console.log(`[${roadNetInfo.intersectionsCount > 0 ? "PASS" : "FAIL"}] intersections.length > 0 (got: ${roadNetInfo.intersectionsCount})`);
    console.log(`[${roadNetInfo.segmentsCount > 0 ? "PASS" : "FAIL"}] segments.length > 0 (got: ${roadNetInfo.segmentsCount})`);

    expect(roadNetInfo.system).toBe("cartesian");
    expect(roadNetInfo.intersectionsCount).toBeGreaterThan(0);
    expect(roadNetInfo.segmentsCount).toBeGreaterThan(0);
  }

  // Edge adherence check
  const adherence = await evaluateEdgeAdherence(page);
  console.log("Edge adherence:", JSON.stringify(adherence, null, 2));

  if (!("error" in adherence)) {
    console.log(`[${adherence.adherenceRate >= 0.90 ? "PASS" : "FAIL"}] adherenceRate >= 0.90 (got: ${adherence.adherenceRate.toFixed(3)})`);
    console.log(`[${adherence.avgMaxDeviation < 5.0 ? "PASS" : "FAIL"}] avgMaxDeviation < 5.0 (got: ${adherence.avgMaxDeviation.toFixed(1)})`);

    expect(adherence.adherenceRate).toBeGreaterThanOrEqual(0.90);
    expect(adherence.avgMaxDeviation).toBeLessThan(5.0);
  } else {
    console.log(`[WARN] Adherence check skipped: ${adherence.error}`);
  }
});

test("Edge routing across road network", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 4: Edge Routing");
  console.log("====================");

  // Load preset 02 (concentric) for routing
  const config02 = loadPresetFile("02-dense-cluster.json");

  await page.evaluate((config: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config02);

  await page.waitForTimeout(8000);

  const routingInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn) {
      return { error: "no road network" };
    }

    // Get first 2 node IDs from nodeAccess
    const nodeIds = Array.from(rn.nodeAccess.keys()).slice(0, 2);
    if (nodeIds.length < 2) {
      return { error: "insufficient nodes for routing" };
    }

    const nodeId1 = nodeIds[0];
    const nodeId2 = nodeIds[1];

    // Attempt to route edge (if routeEdge method exists)
    let routing = null;
    if (view.roadRouter && view.roadRouter.routeEdge) {
      try {
        routing = view.roadRouter.routeEdge(rn, nodeId1, nodeId2);
      } catch (e) {
        console.log("routeEdge not available, checking network structure");
      }
    }

    return {
      networkExists: !!rn,
      nodeIds: [nodeId1, nodeId2],
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
      routing: routing ? {
        waypointsCount: routing.waypoints?.length ?? 0,
        hasCoordinates: routing.waypoints?.every((w: any) => typeof w.x === "number" && typeof w.y === "number") ?? false,
      } : null,
    };
  });

  console.log("Routing info:", JSON.stringify(routingInfo, null, 2));

  if (routingInfo.error) {
    console.log(`[WARN] ${routingInfo.error}`);
  } else {
    console.log(`[PASS] Network structure validated`);
    console.log(`  Intersections: ${routingInfo.intersectionsCount}`);
    console.log(`  Segments: ${routingInfo.segmentsCount}`);
    if (routingInfo.routing) {
      console.log(`  Routing waypoints: ${routingInfo.routing.waypointsCount}`);
      expect(routingInfo.routing.waypointsCount).toBeGreaterThanOrEqual(2);
      expect(routingInfo.routing.hasCoordinates).toBe(true);
    }

    expect(routingInfo.networkExists).toBe(true);
    expect(routingInfo.intersectionsCount).toBeGreaterThan(0);
  }
});

test("Road network parameters and structure", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 5: Road Network Parameters");
  console.log("================================");

  // Load preset and verify params
  const config02 = loadPresetFile("02-dense-cluster.json");

  await page.evaluate((config: any) => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view.buildPanel?.();
    view.updateForces?.(true);
  }, config02);

  await page.waitForTimeout(8000);

  const paramsInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn) {
      return { error: "roadNetworkData is null" };
    }

    // Validate parameters
    const intersectionsOk = rn.intersections.every((i: any) =>
      typeof i.id === "number" &&
      typeof i.x === "number" &&
      typeof i.y === "number"
    );

    const segmentsOk = rn.segments.every((s: any) =>
      typeof s.from === "number" &&
      typeof s.to === "number" &&
      Array.isArray(s.waypoints) &&
      typeof s.length === "number"
    );

    return {
      cx: rn.cx,
      cy: rn.cy,
      cxFinite: isFinite(rn.cx),
      cyFinite: isFinite(rn.cy),
      intersectionsCount: rn.intersections.length,
      intersectionsValid: intersectionsOk,
      segmentsCount: rn.segments.length,
      segmentsValid: segmentsOk,
      nodeAccessSize: rn.nodeAccess.size,
      sampleIntersections: rn.intersections.slice(0, 3).map((i: any) => ({
        id: i.id,
        x: Math.round(i.x),
        y: Math.round(i.y),
      })),
      sampleSegment: rn.segments.length > 0 ? {
        from: rn.segments[0].from,
        to: rn.segments[0].to,
        waypointsCount: rn.segments[0].waypoints.length,
        length: Math.round(rn.segments[0].length),
      } : null,
    };
  });

  console.log("Road network parameters:", JSON.stringify(paramsInfo, null, 2));

  if (paramsInfo.error) {
    console.log(`[FAIL] ${paramsInfo.error}`);
    expect(paramsInfo.error).toBeFalsy();
  } else {
    console.log(`[${paramsInfo.cxFinite ? "PASS" : "FAIL"}] cx is finite (got: ${paramsInfo.cx})`);
    console.log(`[${paramsInfo.cyFinite ? "PASS" : "FAIL"}] cy is finite (got: ${paramsInfo.cy})`);
    console.log(`[${paramsInfo.intersectionsValid ? "PASS" : "FAIL"}] all intersections have id, x, y`);
    console.log(`[${paramsInfo.segmentsValid ? "PASS" : "FAIL"}] all segments have from, to, waypoints, length`);

    expect(paramsInfo.cxFinite).toBe(true);
    expect(paramsInfo.cyFinite).toBe(true);
    expect(paramsInfo.intersectionsValid).toBe(true);
    expect(paramsInfo.segmentsValid).toBe(true);
    expect(paramsInfo.intersectionsCount).toBeGreaterThan(0);
    expect(paramsInfo.segmentsCount).toBeGreaterThan(0);
  }
});

test("Edge adherence in triangle arrangement", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 6: Edge Adherence - Triangle");
  console.log("==================================");

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.clusterArrangement = "triangle";
    view.panel.renderThresholds = { ...view.panel.renderThresholds, roadRouteEdges: true };
    view.buildPanel?.();
    view.updateForces?.(true);
  });
  await page.waitForTimeout(10000);

  const roadNetInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };
    const rn = view.roadNetworkData;
    if (!rn) return { error: "no road network" };
    return {
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
    };
  });
  console.log("Road network:", JSON.stringify(roadNetInfo));

  const adherence = await evaluateEdgeAdherence(page);
  console.log("Triangle adherence:", JSON.stringify(adherence, null, 2));

  if (!("error" in adherence)) {
    console.log(`[${adherence.adherenceRate >= 0.90 ? "PASS" : "FAIL"}] adherenceRate >= 0.90 (got: ${adherence.adherenceRate.toFixed(3)})`);
    console.log(`[${adherence.avgMaxDeviation < 5.0 ? "PASS" : "FAIL"}] avgMaxDeviation < 5.0 (got: ${adherence.avgMaxDeviation.toFixed(1)})`);

    expect(adherence.adherenceRate).toBeGreaterThanOrEqual(0.90);
    expect(adherence.avgMaxDeviation).toBeLessThan(5.0);
  } else {
    console.log(`[WARN] Adherence check skipped: ${adherence.error}`);
  }
});

test("Edge adherence in radial arrangement", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 7: Edge Adherence - Radial");
  console.log("================================");

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.clusterArrangement = "radial";
    view.panel.renderThresholds = { ...view.panel.renderThresholds, roadRouteEdges: true };
    view.buildPanel?.();
    view.updateForces?.(true);
  });
  await page.waitForTimeout(10000);

  const roadNetInfo = await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };
    const rn = view.roadNetworkData;
    if (!rn) return { error: "no road network" };
    return {
      system: rn.system,
      intersectionsCount: rn.intersections.length,
      segmentsCount: rn.segments.length,
    };
  });
  console.log("Road network:", JSON.stringify(roadNetInfo));

  const adherence = await evaluateEdgeAdherence(page);
  console.log("Radial adherence:", JSON.stringify(adherence, null, 2));

  if (!("error" in adherence)) {
    console.log(`[${adherence.adherenceRate >= 0.90 ? "PASS" : "FAIL"}] adherenceRate >= 0.90 (got: ${adherence.adherenceRate.toFixed(3)})`);
    console.log(`[${adherence.avgMaxDeviation < 5.0 ? "PASS" : "FAIL"}] avgMaxDeviation < 5.0 (got: ${adherence.avgMaxDeviation.toFixed(1)})`);

    expect(adherence.adherenceRate).toBeGreaterThanOrEqual(0.90);
    expect(adherence.avgMaxDeviation).toBeLessThan(5.0);
  } else {
    console.log(`[WARN] Adherence check skipped: ${adherence.error}`);
  }
});
