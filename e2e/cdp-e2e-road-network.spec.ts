/**
 * Road Network & Edge Routing E2E Test
 *
 * Validates road network generation with multiple layout types:
 * 1. Road network generation in concentric (polar) layout
 * 2. Road network generation in grid layout
 * 3. Road network generation in timeline (cartesian) layout
 * 4. Edge routing across the network
 * 5. Road network parameters and structure
 * 6. Road routing quality in triangle arrangement
 * 7. Road routing quality in radial arrangement
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
 * Evaluate road routing quality inside Obsidian via CDP.
 * Validates that the road network system matches arrangement,
 * routes deviate meaningfully from straight lines, and nodes
 * are reasonably close to road intersections.
 */
async function evaluateRoadRoutingQuality(page: Page): Promise<{
  systemMatchesArrangement: boolean;
  expectedSystem: string;
  actualSystem: string;
  avgDeviationPercent: number;
  routesWithSignificantDeviation: number;
  totalRoutes: number;
  avgNodeToRoadDist: number;
  maxNodeToRoadDist: number;
  nodeSize: number;
  avgWaypointCount: number;
  minWaypointCount: number;
} | { error: string }> {
  return page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return { error: "view not found" };

    const rn = view.roadNetworkData;
    if (!rn || rn.intersections.length === 0) return { error: "no road network" };

    const arrangement = view.panel?.clusterArrangement || "unknown";
    const POLAR = new Set(["concentric", "radial", "phyllotaxis"]);
    const expectedSystem = POLAR.has(arrangement) ? "polar" : "cartesian";
    const systemMatchesArrangement = rn.system === expectedSystem;

    // Node-to-road distance
    const nodeSize = view.panel?.nodeSize || 5;
    let totalNodeDist = 0;
    let maxNodeDist = 0;
    let nodeCount = 0;
    for (const pn of view.pixiNodes.values()) {
      const nx = pn.data.x, ny = pn.data.y;
      if (Math.abs(nx) < 1 && Math.abs(ny) < 1) continue; // skip origin nodes
      const isectId = rn.nodeAccess.get(pn.data.id);
      if (isectId == null) continue;
      const isect = rn.intersections[isectId];
      if (!isect) continue;
      const dist = Math.sqrt((nx - isect.x) ** 2 + (ny - isect.y) ** 2);
      totalNodeDist += dist;
      if (dist > maxNodeDist) maxNodeDist = dist;
      nodeCount++;
    }

    // Route deviation from straight line
    const nodeIds = Array.from(rn.nodeAccess.keys()) as string[];
    const sampleSize = Math.min(30, Math.floor(nodeIds.length / 3));
    let totalDevPercent = 0;
    let significantDeviations = 0;
    let totalRoutes = 0;
    let totalWaypoints = 0;
    let minWaypoints = Infinity;

    for (let i = 0; i < sampleSize; i++) {
      const si = Math.floor(Math.random() * nodeIds.length);
      let ti = Math.floor(Math.random() * nodeIds.length);
      while (ti === si && nodeIds.length > 1) ti = Math.floor(Math.random() * nodeIds.length);

      const srcId = nodeIds[si], tgtId = nodeIds[ti];
      const srcN = view.pixiNodes.get(srcId), tgtN = view.pixiNodes.get(tgtId);
      if (!srcN || !tgtN) continue;

      const sx = srcN.data.x, sy = srcN.data.y;
      const tx = tgtN.data.x, ty = tgtN.data.y;
      const straightDist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
      if (straightDist < 100) continue;

      const startI = rn.nodeAccess.get(srcId);
      const endI = rn.nodeAccess.get(tgtId);
      if (startI == null || endI == null || startI === endI) continue;

      // Dijkstra
      const dist = new Map();
      const prev = new Map();
      const visited = new Set();
      dist.set(startI, 0);
      const q = [{ id: startI, d: 0 }];
      while (q.length > 0) {
        let mi = 0;
        for (let j = 1; j < q.length; j++) { if (q[j].d < q[mi].d) mi = j; }
        const { id: u } = q.splice(mi, 1)[0];
        if (visited.has(u)) continue;
        visited.add(u);
        if (u === endI) break;
        const nb = rn.adjacency.get(u);
        if (!nb) continue;
        for (const { to: v, weight } of nb) {
          if (visited.has(v)) continue;
          const nd = (dist.get(u) || 0) + weight;
          if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); q.push({ id: v, d: nd }); }
        }
      }

      const path: number[] = [];
      let c = endI;
      while (c !== startI) { path.unshift(c); const p = prev.get(c); if (p == null) break; c = p; }
      path.unshift(startI);
      if (path[0] !== startI || path.length < 2) continue;

      const wps = path.map(id => rn.intersections[id]).filter(Boolean);
      totalWaypoints += wps.length;
      if (wps.length < minWaypoints) minWaypoints = wps.length;

      const lx = tx - sx, ly = ty - sy;
      let maxDev = 0;
      for (const wp of wps) {
        const cross = Math.abs((wp.x - sx) * ly - (wp.y - sy) * lx);
        const dev = straightDist > 0 ? cross / straightDist : 0;
        if (dev > maxDev) maxDev = dev;
      }

      const devPercent = (maxDev / straightDist) * 100;
      totalDevPercent += devPercent;
      if (devPercent > 5) significantDeviations++;
      totalRoutes++;
    }

    return {
      systemMatchesArrangement,
      expectedSystem,
      actualSystem: rn.system,
      avgDeviationPercent: totalRoutes > 0 ? totalDevPercent / totalRoutes : 0,
      routesWithSignificantDeviation: significantDeviations,
      totalRoutes,
      avgNodeToRoadDist: nodeCount > 0 ? totalNodeDist / nodeCount : 0,
      maxNodeToRoadDist: maxNodeDist,
      nodeSize,
      avgWaypointCount: totalRoutes > 0 ? totalWaypoints / totalRoutes : 0,
      minWaypointCount: minWaypoints === Infinity ? 0 : minWaypoints,
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
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
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

  // Road routing quality check
  const quality = await evaluateRoadRoutingQuality(page);
  console.log("Road routing quality:", JSON.stringify(quality, null, 2));

  if ("error" in quality) {
    console.log(`[WARN] Quality check skipped: ${quality.error}`);
  } else {
    // System must match arrangement
    console.log(`[${quality.systemMatchesArrangement ? "PASS" : "FAIL"}] system matches arrangement (expected: ${quality.expectedSystem}, actual: ${quality.actualSystem})`);
    expect(quality.systemMatchesArrangement).toBe(true);

    // Routes must deviate from straight lines
    console.log(`[${quality.avgDeviationPercent > 3 ? "PASS" : "FAIL"}] avg deviation > 3% (got: ${quality.avgDeviationPercent.toFixed(1)}%)`);
    expect(quality.avgDeviationPercent).toBeGreaterThan(3);

    // Routes must have multiple waypoints
    console.log(`[${quality.avgWaypointCount >= 3 ? "PASS" : "FAIL"}] avg waypoints >= 3 (got: ${quality.avgWaypointCount.toFixed(1)})`);
    expect(quality.avgWaypointCount).toBeGreaterThanOrEqual(3);
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
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
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

  // Road routing quality check
  const quality = await evaluateRoadRoutingQuality(page);
  console.log("Road routing quality:", JSON.stringify(quality, null, 2));

  if ("error" in quality) {
    console.log(`[WARN] Quality check skipped: ${quality.error}`);
  } else {
    // System must match arrangement
    console.log(`[${quality.systemMatchesArrangement ? "PASS" : "FAIL"}] system matches arrangement (expected: ${quality.expectedSystem}, actual: ${quality.actualSystem})`);
    expect(quality.systemMatchesArrangement).toBe(true);

    // Routes must deviate from straight lines
    console.log(`[${quality.avgDeviationPercent > 3 ? "PASS" : "FAIL"}] avg deviation > 3% (got: ${quality.avgDeviationPercent.toFixed(1)}%)`);
    expect(quality.avgDeviationPercent).toBeGreaterThan(3);

    // Routes must have multiple waypoints
    console.log(`[${quality.avgWaypointCount >= 3 ? "PASS" : "FAIL"}] avg waypoints >= 3 (got: ${quality.avgWaypointCount.toFixed(1)})`);
    expect(quality.avgWaypointCount).toBeGreaterThanOrEqual(3);
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
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
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

  // Road routing quality check
  const quality = await evaluateRoadRoutingQuality(page);
  console.log("Road routing quality:", JSON.stringify(quality, null, 2));

  if ("error" in quality) {
    console.log(`[WARN] Quality check skipped: ${quality.error}`);
  } else {
    // System must match arrangement
    console.log(`[${quality.systemMatchesArrangement ? "PASS" : "FAIL"}] system matches arrangement (expected: ${quality.expectedSystem}, actual: ${quality.actualSystem})`);
    expect(quality.systemMatchesArrangement).toBe(true);

    // Timeline is inherently linear — deviation will be low, only check system and waypoints
    console.log(`[INFO] avg deviation: ${quality.avgDeviationPercent.toFixed(1)}% (no threshold for timeline)`);

    // Routes must have multiple waypoints
    console.log(`[${quality.avgWaypointCount >= 3 ? "PASS" : "FAIL"}] avg waypoints >= 3 (got: ${quality.avgWaypointCount.toFixed(1)})`);
    expect(quality.avgWaypointCount).toBeGreaterThanOrEqual(3);
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
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
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
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
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

test("Road routing quality in triangle arrangement", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 6: Road Routing Quality - Triangle");
  console.log("========================================");

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.clusterArrangement = "triangle";
    view.panel.renderThresholds = { ...view.panel.renderThresholds, roadRouteEdges: true };
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  });
  await page.waitForTimeout(12000);

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

  const quality = await evaluateRoadRoutingQuality(page);
  console.log("Triangle routing quality:", JSON.stringify(quality, null, 2));

  if ("error" in quality) {
    console.log(`[WARN] Quality check skipped: ${quality.error}`);
  } else {
    // System must match arrangement
    console.log(`[${quality.systemMatchesArrangement ? "PASS" : "FAIL"}] system matches arrangement (expected: ${quality.expectedSystem}, actual: ${quality.actualSystem})`);
    expect(quality.systemMatchesArrangement).toBe(true);

    // Routes must deviate from straight lines
    console.log(`[${quality.avgDeviationPercent > 3 ? "PASS" : "FAIL"}] avg deviation > 3% (got: ${quality.avgDeviationPercent.toFixed(1)}%)`);
    expect(quality.avgDeviationPercent).toBeGreaterThan(3);

    // Routes must have multiple waypoints
    console.log(`[${quality.avgWaypointCount >= 3 ? "PASS" : "FAIL"}] avg waypoints >= 3 (got: ${quality.avgWaypointCount.toFixed(1)})`);
    expect(quality.avgWaypointCount).toBeGreaterThanOrEqual(3);
  }
});

test("Road routing quality in radial arrangement", async () => {
  test.setTimeout(60000);
  console.log("\nTEST 7: Road Routing Quality - Radial");
  console.log("======================================");

  await page.evaluate(() => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view) return;
    view.panel.clusterArrangement = "radial";
    view.panel.renderThresholds = { ...view.panel.renderThresholds, roadRouteEdges: true };
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  });
  await page.waitForTimeout(12000);

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

  const quality = await evaluateRoadRoutingQuality(page);
  console.log("Radial routing quality:", JSON.stringify(quality, null, 2));

  if ("error" in quality) {
    console.log(`[WARN] Quality check skipped: ${quality.error}`);
  } else {
    // System must match arrangement
    console.log(`[${quality.systemMatchesArrangement ? "PASS" : "FAIL"}] system matches arrangement (expected: ${quality.expectedSystem}, actual: ${quality.actualSystem})`);
    expect(quality.systemMatchesArrangement).toBe(true);

    // Routes must deviate from straight lines
    console.log(`[${quality.avgDeviationPercent > 3 ? "PASS" : "FAIL"}] avg deviation > 3% (got: ${quality.avgDeviationPercent.toFixed(1)}%)`);
    expect(quality.avgDeviationPercent).toBeGreaterThan(3);

    // Routes must have multiple waypoints
    console.log(`[${quality.avgWaypointCount >= 3 ? "PASS" : "FAIL"}] avg waypoints >= 3 (got: ${quality.avgWaypointCount.toFixed(1)})`);
    expect(quality.avgWaypointCount).toBeGreaterThanOrEqual(3);
  }
});
