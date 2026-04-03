/**
 * RoadNetworkBuilder — extracted from GraphViewContainer.
 *
 * Responsible for generating the road network (cable-tray topology) from
 * cluster metadata, arrangement guides, and node positions.  The actual
 * *drawing* of the road network remains in GVC; this class only builds
 * the data structure.
 */
import type { GraphNode, GraphEdge, RenderThresholds } from "../types";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import { buildRoadNetwork, buildRoadNetworkFromPhantoms, addTrunkRoads, type RoadNetwork } from "./cable-tray";
import type { ClusterMetadata, ArrangementGuide, GroupGuideEntry } from "./cluster-force";
import type { ResolvedGridInfo } from "./coordinate-engine";
import type { Simulation } from "d3-force";
import {
  ARRANGEMENT_TRIANGLE,
  GUIDE_TYPE_COORDINATE,
  POLAR_ARRANGEMENTS,
} from "../constants";

// ---------------------------------------------------------------------------
// Host interface — the minimum surface the builder needs from GVC
// ---------------------------------------------------------------------------

export interface RoadNetworkHost {
  readonly pixiNodes: ReadonlyMap<string, { data: GraphNode }>;
  readonly clusterMeta: ClusterMetadata | null;
  readonly panel: {
    clusterArrangement: string;
    clusterGroupArrangement: string;
    renderThresholds?: RenderThresholds;
  };
  getSimulation(): Simulation<GraphNode, GraphEdge> | null;
  computeNodeBounds(nodes: GraphNode[]): { xMin: number; yMin: number; xMax: number; yMax: number };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class RoadNetworkBuilder {
  trayData: RoadNetwork | null = null;
  finalized = false;
  roadDrawn = false;
  /** Last drawn road width (world units) for zoom-adaptive redraw check */
  _lastRoadWidth = 0;

  constructor(private host: RoadNetworkHost) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Rebuild the road network.  When `final` is true the network is locked
   *  until the next explicit reset. */
  rebuild(final = false): void {
    if (this.finalized && !final) return;
    this._buildInner();
    this.roadDrawn = false; // invalidate draw cache
    if (final) {
      this.finalized = true;
    }
  }

  /** Add trunk roads between group centroids and update the global cache. */
  finish(allNodes: GraphNode[]): void {
    if (!this.trayData) return;
    const meta = this.host.clusterMeta;
    if (meta?.clusterCentroids) {
      const centroids: { x: number; y: number }[] = [];
      for (const [, c] of meta.clusterCentroids) {
        centroids.push({ x: c.x, y: c.y });
      }
      if (centroids.length > 1) {
        addTrunkRoads(this.trayData, centroids);
        // Re-map nodes to nearest intersection (trunk roads may provide closer access)
        for (const node of allNodes) {
          let bestId = this.trayData.intersections.length > 0 ? this.trayData.intersections[0].id : -1;
          let bestDist = Infinity;
          for (const isect of this.trayData.intersections) {
            const dx = node.x - isect.x;
            const dy = node.y - isect.y;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; bestId = isect.id; }
          }
          this.trayData.nodeAccess.set(node.id, bestId);
        }
      }
    }
    this._updateCache();
  }

  /** Reset state flags (but keep trayData intact). */
  reset(): void {
    this.finalized = false;
    this.roadDrawn = false;
  }

  /** Update global cache if new network is denser. */
  private _updateCache(): void {
    if (this.trayData) _setBestRoadNetwork(this.trayData);
  }

  // -----------------------------------------------------------------------
  // Inner builder — dispatches to topology-specific builders
  // -----------------------------------------------------------------------

  private _buildInner(): void {
    const meta = this.host.clusterMeta;
    if (!meta) return;

    // Collect all positioned nodes (skip nodes still at origin from early ticks)
    const allNodes: GraphNode[] = [];
    for (const pn of this.host.pixiNodes.values()) {
      if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) {
        allNodes.push(pn.data);
      }
    }
    if (allNodes.length === 0) return; // Keep existing road network if no positioned nodes yet

    // Phantom-based road network: if simulation has phantom nodes, use them
    if (this._buildFromPhantoms(allNodes)) return;

    // Determine road topology from arrangement name, NOT from guide system.
    const arrangement = this.host.panel.clusterArrangement;
    // POLAR_ARRANGEMENTS imported from constants
    const isPolarArrangement = POLAR_ARRANGEMENTS.has(arrangement);

    // Try to derive road network from guide data attached to cluster metadata.
    const guides = meta.groupGuides;
    if (guides && guides.length > 0) {
      const coordGuides: { guide: { system: string; gridInfo: ResolvedGridInfo; bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number } }; centerX: number; centerY: number }[] = [];
      for (const gg of guides) {
        const g = gg.guide;
        if (!g) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- guide type narrowing
        if (g.type === GUIDE_TYPE_COORDINATE && (g as any).gridInfo) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          coordGuides.push({ guide: g as any, centerX: gg.centerX, centerY: gg.centerY });
        }
        if (this._buildFromConcentric(g, gg, allNodes)) return;
        if (this._buildFromGrid(g, gg, allNodes)) return;
        if (this._buildFromTriangle(g, gg, allNodes)) return;
        if (this._buildFromTimeline(g, allNodes)) return;
      }

      if (this._buildFromCoordinates(coordGuides, isPolarArrangement, allNodes)) return;
    }

    // Fallback: no guide data available — generate roads from node distribution
    this._buildFallback(arrangement, allNodes);
  }

  // -----------------------------------------------------------------------
  // Topology-specific builders
  // -----------------------------------------------------------------------

  /** Phantom node-based road network from simulation phantom nodes */
  private _buildFromPhantoms(allNodes: GraphNode[]): boolean {
    const sim = this.host.getSimulation();
    const simNodes = sim?.nodes?.() as GraphNode[] | undefined;
    const phantomNodes = simNodes?.filter(n => n.isPhantom && (Math.abs(n.x) > 1 || Math.abs(n.y) > 1));
    if (!phantomNodes || phantomNodes.length === 0) return false;

    const arrangement = this.host.panel.clusterArrangement;
    // Use shared POLAR_ARRANGEMENTS from constants
    const bounds = this.host.computeNodeBounds(allNodes);
    const gcx = (bounds.xMin + bounds.xMax) / 2;
    const gcy = (bounds.yMin + bounds.yMax) / 2;
    this.trayData = buildRoadNetworkFromPhantoms(
      phantomNodes, allNodes,
      POLAR_ARRANGEMENTS.has(arrangement) ? "polar" : "cartesian",
      gcx, gcy,
    );
    this.finish(allNodes);
    return true;
  }

  /** ConcentricGuide: rings become circle roads, uniform spokes become radial roads */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- guide type discriminated union
  private _buildFromConcentric(g: any, gg: { centerX: number; centerY: number }, allNodes: GraphNode[]): boolean {
    if (g.type !== "concentric") return false;
    const cg = g as { type: "concentric"; rings: number[] };
    if (cg.rings.length === 0) return false;

    const spokeCount = Math.min(16, Math.max(8, Math.ceil(Math.sqrt(allNodes.length / 5))));
    const maxRing = Math.max(...cg.rings);
    const sortedRings = [...cg.rings].sort((a, b) => a - b);
    this.trayData = buildRoadNetwork({
      system: "polar",
      axis1Lines: sortedRings.map(r => ({ position: r })),
      axis2Lines: Array.from({ length: spokeCount }, (_, i) => ({
        position: (i / spokeCount) * Math.PI * 2,
      })),
      axis1Shape: "circle", axis2Shape: "radial",
      cx: gg.centerX, cy: gg.centerY,
      bounds: { xMin: -maxRing, yMin: -maxRing, xMax: maxRing, yMax: maxRing, maxR: maxRing },
      nodes: allNodes,
    });
    this.finish(allNodes);
    return true;
  }

  /** GridGuide: verticals/horizontals become line roads */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- guide type discriminated union
  private _buildFromGrid(g: any, gg: { centerX: number; centerY: number }, allNodes: GraphNode[]): boolean {
    if (g.type !== "grid") return false;
    const gg2 = g as { type: "grid"; verticals: number[]; horizontals: number[]; bounds: { xMin: number; yMin: number; xMax: number; yMax: number } };
    const verts = (gg2.verticals ?? []).sort((a: number, b: number) => a - b);
    const horiz = (gg2.horizontals ?? []).sort((a: number, b: number) => a - b);
    this.trayData = buildRoadNetwork({
      system: "cartesian",
      axis1Lines: verts.map(v => ({ position: v })),
      axis2Lines: horiz.map(h => ({ position: h })),
      axis1Shape: "line", axis2Shape: "line",
      cx: 0, cy: 0,
      bounds: gg2.bounds ?? this.host.computeNodeBounds(allNodes),
      nodes: allNodes,
    });
    this.finish(allNodes);
    return true;
  }

  /** TriangleGuide: horizontal roads at each row, vertical roads spanning columns */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- guide type discriminated union
  private _buildFromTriangle(g: any, gg: { centerX: number; centerY: number }, allNodes: GraphNode[]): boolean {
    if (g.type !== ARRANGEMENT_TRIANGLE) return false;
    const tg = g as { type: "triangle"; vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] };
    const [top, bottomLeft, bottomRight] = tg.vertices;
    const triHeight = bottomLeft.y - top.y;
    const triWidth = bottomRight.x - bottomLeft.x;
    let numRows = 1;
    while (numRows * (numRows + 1) / 2 < allNodes.length) numRows++;
    numRows = Math.max(numRows, 2);
    const rowSpacing = triHeight / (numRows - 1 || 1);
    const horizLines: { position: number }[] = [];
    for (let r = 0; r < numRows; r++) {
      horizLines.push({ position: top.y + r * rowSpacing });
    }
    const numCols = Math.max(numRows, Math.ceil(Math.sqrt(allNodes.length)));
    const colSpacing = triWidth / (numCols - 1 || 1);
    const vertLines: { position: number }[] = [];
    for (let c = 0; c < numCols; c++) {
      vertLines.push({ position: bottomLeft.x + c * colSpacing });
    }
    this.trayData = buildRoadNetwork({
      system: "cartesian",
      axis1Lines: vertLines,
      axis2Lines: horizLines,
      axis1Shape: "line", axis2Shape: "line",
      cx: gg.centerX, cy: gg.centerY,
      bounds: { xMin: bottomLeft.x, yMin: top.y, xMax: bottomRight.x, yMax: bottomLeft.y },
      nodes: allNodes,
    });
    this.finish(allNodes);
    return true;
  }

  /** TimelineGuide: ticks become vertical roads, axisY becomes horizontal road */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- guide type discriminated union
  private _buildFromTimeline(g: any, allNodes: GraphNode[]): boolean {
    if (g.type !== "timeline") return false;
    const tl = g as { type: "timeline"; axisY: number; ticks: { x: number; label: string }[] };
    this.trayData = buildRoadNetwork({
      system: "cartesian",
      axis1Lines: (tl.ticks ?? []).map((t: { x: number }) => ({ position: t.x })),
      axis2Lines: [{ position: tl.axisY ?? 0 }],
      axis1Shape: "line", axis2Shape: "line",
      cx: 0, cy: 0,
      bounds: this.host.computeNodeBounds(allNodes),
      nodes: allNodes,
    });
    this.finish(allNodes);
    return true;
  }

  /** CoordinateGuide: merge axis lines into road network (polar or cartesian) */
  private _buildFromCoordinates(
    coordGuides: { guide: { system: string; gridInfo: ResolvedGridInfo; bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number } }; centerX: number; centerY: number }[],
    isPolarArrangement: boolean,
    allNodes: GraphNode[],
  ): boolean {
    if (coordGuides.length === 0) return false;

    const bounds = this.host.computeNodeBounds(allNodes);

    if (isPolarArrangement) {
      const gcx = (bounds.xMin + bounds.xMax) / 2;
      const gcy = (bounds.yMin + bounds.yMax) / 2;

      // Ring radii: quantile-based from node distance distribution
      const dists = allNodes.map(n =>
        Math.sqrt((n.x - gcx) ** 2 + (n.y - gcy) ** 2)
      ).sort((a, b) => a - b);
      const maxR = dists[dists.length - 1] || 1;
      const ringCount = Math.min(12, Math.max(6, Math.ceil(Math.sqrt(allNodes.length / 10))));
      const ringRadii: { position: number }[] = [];
      for (let i = 1; i <= ringCount; i++) {
        const q = dists[Math.floor(dists.length * i / (ringCount + 1))] ?? (maxR * i / ringCount);
        ringRadii.push({ position: q });
      }

      const spokeCount = Math.min(16, Math.max(8, Math.ceil(Math.sqrt(allNodes.length / 5))));
      const spokeAngles: { position: number }[] = Array.from({ length: spokeCount }, (_, i) => ({
        position: (i / spokeCount) * Math.PI * 2,
      }));

      this.trayData = buildRoadNetwork({
        system: "polar",
        axis1Lines: ringRadii,
        axis2Lines: spokeAngles,
        axis1Shape: "circle", axis2Shape: "radial",
        cx: gcx, cy: gcy,
        bounds: { ...bounds, maxR },
        nodes: allNodes,
      });
    } else {
      // Cartesian: merge axis lines with world-space offsets, then shift to
      // midpoints so cable tray intersections sit BETWEEN nodes.
      const allA1 = new Set<number>();
      const allA2 = new Set<number>();
      for (const cg of coordGuides) {
        const gi = cg.guide.gridInfo;
        for (const l of gi.axis1Lines) allA1.add(l.position + cg.centerX);
        for (const l of gi.axis2Lines) allA2.add(l.position + cg.centerY);
      }
      const sortedA1 = [...allA1].sort((a, b) => a - b);
      const sortedA2 = [...allA2].sort((a, b) => a - b);
      const midA1: number[] = [];
      for (let i = 0; i < sortedA1.length - 1; i++) midA1.push((sortedA1[i] + sortedA1[i + 1]) / 2);
      const midA2: number[] = [];
      for (let i = 0; i < sortedA2.length - 1; i++) midA2.push((sortedA2[i] + sortedA2[i + 1]) / 2);
      this.trayData = buildRoadNetwork({
        system: "cartesian",
        axis1Lines: midA1.map(p => ({ position: p })),
        axis2Lines: midA2.map(p => ({ position: p })),
        axis1Shape: coordGuides[0].guide.gridInfo.axis1Shape?.kind ?? "line",
        axis2Shape: coordGuides[0].guide.gridInfo.axis2Shape?.kind ?? "line",
        cx: (bounds.xMin + bounds.xMax) / 2, cy: (bounds.yMin + bounds.yMax) / 2,
        bounds,
        nodes: allNodes,
      });
    }
    this.finish(allNodes);
    return true;
  }

  /** Fallback: no guide data — derive road network from node distribution */
  private _buildFallback(arrangement: string, allNodes: GraphNode[]): void {
    const bounds = this.host.computeNodeBounds(allNodes);
    const gcx = (bounds.xMin + bounds.xMax) / 2;
    const gcy = (bounds.yMin + bounds.yMax) / 2;

    const isCartesian = arrangement === "grid" || arrangement === "triangle" || arrangement === "square";

    if (isCartesian) {
      const width = bounds.xMax - bounds.xMin || 1;
      const height = bounds.yMax - bounds.yMin || 1;
      const gridSize = Math.min(16, Math.max(8, Math.ceil(Math.sqrt(allNodes.length / 8))));
      const xStep = width / gridSize;
      const yStep = height / gridSize;

      const xLines: { position: number }[] = [];
      const yLines: { position: number }[] = [];
      for (let i = 0; i < gridSize; i++) {
        xLines.push({ position: bounds.xMin + (i + 0.5) * xStep });
        yLines.push({ position: bounds.yMin + (i + 0.5) * yStep });
      }

      this.trayData = buildRoadNetwork({
        system: "cartesian",
        axis1Lines: xLines,
        axis2Lines: yLines,
        axis1Shape: "line", axis2Shape: "line",
        cx: gcx, cy: gcy,
        bounds,
        nodes: allNodes,
      });
    } else {
      const dists = allNodes.map(n => Math.sqrt((n.x - gcx) ** 2 + (n.y - gcy) ** 2)).sort((a, b) => a - b);
      const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.panel.renderThresholds };
      const ringCount = rt.roadRingCount || Math.min(12, Math.max(6, Math.ceil(Math.sqrt(allNodes.length / 10))));
      const spokeCount = rt.roadSpokeCount || Math.min(16, Math.max(8, Math.ceil(Math.sqrt(allNodes.length / 5))));

      this.trayData = buildRoadNetwork({
        system: "polar",
        axis1Lines: Array.from({ length: ringCount }, (_, i) => ({
          position: dists[Math.floor(dists.length * (i + 1) / (ringCount + 1))] ?? 1,
        })),
        axis2Lines: Array.from({ length: spokeCount }, (_, i) => ({
          position: (i / spokeCount) * Math.PI * 2,
        })),
        axis1Shape: "circle", axis2Shape: "radial",
        cx: gcx, cy: gcy,
        bounds: { ...bounds, maxR: dists[dists.length - 1] ?? 1 },
        nodes: allNodes,
      });
    }
    this.finish(allNodes);
  }
}

// ---------------------------------------------------------------------------
// Global cache — stored on window to persist across plugin disable/enable
// ---------------------------------------------------------------------------

function _getBestRoadNetwork(): RoadNetwork | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global cache on window
  return (window as any).__gi_bestRoadNetwork ?? null;
}

function _setBestRoadNetwork(rn: RoadNetwork) {
  const cur = _getBestRoadNetwork();
  if (!cur || rn.intersections.length > cur.intersections.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global cache on window
    (window as any).__gi_bestRoadNetwork = rn;
  }
}

/** Retrieve the best (densest) road network from either the builder instance or the global cache. */
export function getBestRoadNetwork(builder: RoadNetworkBuilder | null): RoadNetwork | null {
  const best = _getBestRoadNetwork();
  const inst = builder?.trayData ?? null;
  if (best && inst) {
    return (best.intersections.length >= inst.intersections.length) ? best : inst;
  }
  return best ?? inst;
}
