import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide, type Simulation, type Force } from "d3-force";
import type { GraphNode, GraphEdge, DirectionalGravityRule, ClusterGroupRule, NodeRule } from "../types";
import type { PanelState } from "./PanelBuilder";
import { resolveDirection, matchesFilter } from "../layouts/force";
import { buildClusterForce, type ClusterMetadata } from "../layouts/cluster-force";
import { computeInDegree, computePropagatedImportance } from "../analysis/graph-analysis";
import { buildMultiSortComparator, type SortMetrics } from "../utils/sort";
import { edgeLinkDistance, edgeLinkStrength } from "../utils/force-config";
import type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// LayoutHost — the interface the LayoutController needs from its parent
// ---------------------------------------------------------------------------
export interface LayoutHost {
  /** Get the panel state for force/layout configuration */
  getPanel(): PanelState;
  /** Get the d3 force simulation */
  getSimulation(): Simulation<GraphNode, GraphEdge> | null;
  /** Set the simulation reference (for initial setup) */
  setSimulation(sim: Simulation<GraphNode, GraphEdge> | null): void;
  /** Get the graph edges */
  getGraphEdges(): GraphEdge[];
  /** Get the degrees map */
  getDegrees(): Map<string, number>;
  /** Get tag membership (for enclosure repulsion) */
  getTagMembership(): Map<string, Set<string>>;
  /** Get tag relationship pairs cache */
  getTagRelPairsCache(): Set<string>;
  /** Get the PIXI node map (for live centroid computation) */
  getPixiNodes(): Map<string, PixiNode>;
  /** Get the canvas bounding rect dimensions */
  getCanvasSize(): { width: number; height: number };
  /** Get plugin settings directional gravity rules */
  getSettingsDirectionalGravityRules(): DirectionalGravityRule[];
  /** Set cluster metadata (for edge bundling) */
  setClusterMeta(meta: ClusterMetadata | null): void;
  /** Wake the render loop after force changes */
  wakeRenderLoop(): void;
}

// ---------------------------------------------------------------------------
// LayoutController — owns force simulation setup and layout force management
// ---------------------------------------------------------------------------
export class LayoutController {
  private host: LayoutHost;

  constructor(host: LayoutHost) {
    this.host = host;
  }

  // =========================================================================
  // Collision radius — returns a per-node radius accessor for forceCollide
  // =========================================================================
  private collideRadius(): (n: GraphNode) => number {
    const panel = this.host.getPanel();
    const baseSize = panel.nodeSize;
    const degrees = this.host.getDegrees();
    const pixiNodes = this.host.getPixiNodes();
    const PAD = 2; // px gap between node edges
    return (n: GraphNode) => {
      // Use actual PIXI radius if available (accounts for super node scaling + MAX cap)
      const pn = pixiNodes.get(n.id);
      if (pn) return pn.radius + PAD;
      // Fallback: recompute from panel settings
      if (panel.scaleByDegree) {
        const deg = degrees.get(n.id) || 0;
        return Math.min(Math.max(baseSize, baseSize + Math.sqrt(deg) * 3.2), 30) + PAD;
      }
      return baseSize + PAD;
    };
  }

  // =========================================================================
  // Force updates (live panel adjustments)
  // =========================================================================
  updateForces() {
    const sim = this.host.getSimulation();
    if (!sim) return;
    const panel = this.host.getPanel();
    const { width: W, height: H } = this.host.getCanvasSize();
    const graphEdges = this.host.getGraphEdges();

    sim
      .force("charge", forceManyBody<GraphNode>().strength(-panel.repelForce))
      .force("center", forceCenter<GraphNode>(W / 2, H / 2).strength(panel.centerForce))
      .force("link", forceLink<GraphNode, GraphEdge>(graphEdges)
        .id((d) => d.id)
        .distance((e) => edgeLinkDistance(e, panel.linkDistance))
        .strength((e) => edgeLinkStrength(e, panel.linkForce)))
      .force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2));
    this.applyNodeRulesForce();
    this.applyEnclosureRepulsionForce();
    sim.alpha(0.5).restart();
    this.host.wakeRenderLoop();
  }

  // =========================================================================
  // Directional gravity rules
  // =========================================================================
  private getActiveDirectionalGravityRules(): DirectionalGravityRule[] {
    const settingsRules = this.host.getSettingsDirectionalGravityRules();
    const panelRules = this.host.getPanel().directionalGravityRules ?? [];
    return [...settingsRules, ...panelRules];
  }

  /**
   * Unified force from NodeRules gravity + legacy DirectionalGravityRules.
   */
  applyNodeRulesForce() {
    const sim = this.host.getSimulation();
    if (!sim) return;

    const legacyRules = this.getActiveDirectionalGravityRules();
    const nodeRules = this.host.getPanel().nodeRules ?? [];

    type GravEntry = { filter: string; angleRad: number; strength: number };
    const entries: GravEntry[] = [];

    for (const rule of legacyRules) {
      entries.push({
        filter: rule.filter,
        angleRad: resolveDirection(rule.direction),
        strength: rule.strength ?? 0.1,
      });
    }

    for (const rule of nodeRules) {
      if (rule.gravityAngle < 0) continue;
      const angleRad = (rule.gravityAngle * Math.PI) / 180;
      entries.push({
        filter: rule.query,
        angleRad,
        strength: rule.gravityStrength ?? 0.1,
      });
    }

    if (entries.length === 0) {
      sim.force("directionalGravity", null);
      return;
    }

    const forceFn = (alpha: number) => {
      const nodes = sim.nodes();
      for (const entry of entries) {
        const ddx = Math.cos(entry.angleRad);
        const ddy = Math.sin(entry.angleRad);
        const str = entry.strength * alpha;
        for (const node of nodes) {
          if (!matchesFilter(node, entry.filter)) continue;
          node.vx! += ddx * str * 100;
          node.vy! += ddy * str * 100;
        }
      }
    };
    sim.force("directionalGravity", forceFn as Force<GraphNode, GraphEdge>);
  }

  // =========================================================================
  // Node spacing map
  // =========================================================================
  computeNodeSpacingMap(nodes: GraphNode[]): Map<string, number> {
    const map = new Map<string, number>();
    const rules = this.host.getPanel().nodeRules ?? [];
    if (rules.length === 0) return map;

    for (const node of nodes) {
      let spacing = 1.0;
      for (const rule of rules) {
        if (matchesFilter(node, rule.query)) {
          spacing *= rule.spacingMultiplier;
        }
      }
      if (spacing !== 1.0) {
        map.set(node.id, spacing);
      }
    }
    return map;
  }

  // =========================================================================
  // Enclosure repulsion force
  // =========================================================================
  applyEnclosureRepulsionForce() {
    const sim = this.host.getSimulation();
    if (!sim) return;
    const panel = this.host.getPanel();
    const tagMembership = this.host.getTagMembership();

    if (panel.tagDisplay !== "enclosure" || tagMembership.size === 0) {
      sim.force("enclosureRepulsion", null);
      return;
    }

    const nodeIndex = new Map<string, GraphNode>();
    for (const n of sim.nodes()) {
      nodeIndex.set(n.id, n);
    }

    const relPairs = this.host.getTagRelPairsCache();
    const tags = [...tagMembership.keys()];

    const PHASE_THRESHOLD = 0.3;

    const forceFn = (alpha: number) => {
      const userSpacing = panel.enclosureSpacing;
      const effectiveSpacing = alpha > PHASE_THRESHOLD
        ? userSpacing * 3
        : userSpacing;
      const baseStr = alpha > PHASE_THRESHOLD ? 4000 : 2000;

      const centroids: { tag: string; cx: number; cy: number; count: number; radius: number }[] = [];
      for (const tag of tags) {
        const ids = tagMembership.get(tag);
        if (!ids || ids.size === 0) continue;
        let sx = 0, sy = 0, cnt = 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of ids) {
          const n = nodeIndex.get(id);
          if (!n) continue;
          sx += n.x; sy += n.y; cnt++;
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
        if (cnt === 0) continue;
        const r = Math.max(30, Math.hypot(maxX - minX, maxY - minY) / 2);
        centroids.push({ tag, cx: sx / cnt, cy: sy / cnt, count: cnt, radius: r });
      }

      const repStr = baseStr * alpha;
      for (let i = 0; i < centroids.length; i++) {
        for (let j = i + 1; j < centroids.length; j++) {
          const a = centroids[i], b = centroids[j];
          if (relPairs.has(`${a.tag}\0${b.tag}`)) continue;

          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const desiredDist = (a.radius + b.radius) * effectiveSpacing;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= desiredDist) continue;
          if (dist < 1) dist = 1;

          const overlap = desiredDist - dist;
          const force = repStr * overlap / dist;
          const fx = dx * force / dist;
          const fy = dy * force / dist;

          const wA = 1 / a.count;
          const wB = 1 / b.count;
          const idsA = tagMembership.get(a.tag)!;
          const idsB = tagMembership.get(b.tag)!;
          for (const id of idsA) {
            const n = nodeIndex.get(id);
            if (n) { n.vx! -= fx * wA; n.vy! -= fy * wA; }
          }
          for (const id of idsB) {
            const n = nodeIndex.get(id);
            if (n) { n.vx! += fx * wB; n.vy! += fy * wB; }
          }
        }
      }
    };

    sim.force("enclosureRepulsion", forceFn as Force<GraphNode, GraphEdge>);
  }

  // =========================================================================
  // Sort comparator
  // =========================================================================
  buildSortComparator(nodes: GraphNode[], edges: GraphEdge[]): ((a: GraphNode, b: GraphNode) => number) | undefined {
    const rules = this.host.getPanel().sortRules;
    if (!rules || rules.length === 0) return undefined;
    const degrees = this.host.getDegrees();
    const metrics: SortMetrics = { degrees };
    const needsInDegree = rules.some(r => r.key === "in-degree");
    const needsImportance = rules.some(r => r.key === "importance");
    if (needsInDegree) metrics.inDegrees = computeInDegree(nodes, edges);
    if (needsImportance) metrics.importance = computePropagatedImportance(nodes, edges);
    return buildMultiSortComparator(rules, metrics);
  }

  // =========================================================================
  // Live cluster centroids (for edge bundling)
  // =========================================================================
  computeLiveCentroids(clusterMeta: ClusterMetadata | null): Map<string, { x: number; y: number }> | null {
    if (!clusterMeta) return null;
    const pixiNodes = this.host.getPixiNodes();
    const sums = new Map<string, { sx: number; sy: number; cnt: number }>();
    for (const [nodeId, clusterKey] of clusterMeta.nodeClusterMap) {
      const pn = pixiNodes.get(nodeId);
      if (!pn) continue;
      let s = sums.get(clusterKey);
      if (!s) { s = { sx: 0, sy: 0, cnt: 0 }; sums.set(clusterKey, s); }
      s.sx += pn.data.x;
      s.sy += pn.data.y;
      s.cnt++;
    }
    const centroids = new Map<string, { x: number; y: number }>();
    for (const [key, s] of sums) {
      centroids.set(key, { x: s.sx / s.cnt, y: s.sy / s.cnt });
    }
    return centroids;
  }

  // =========================================================================
  // Cluster force
  // =========================================================================
  applyClusterForce() {
    const sim = this.host.getSimulation();
    if (!sim) return;
    const panel = this.host.getPanel();
    const { clusterArrangement, clusterNodeSpacing, clusterGroupScale, clusterGroupSpacing } = panel;

    sim.force("charge", forceManyBody<GraphNode>().strength(-10));
    sim.force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2));
    sim.force("center", null);
    sim.force("link", null);
    sim.force("directionalGravity", null);
    sim.force("enclosureRepulsion", null);

    const { width: W, height: H } = this.host.getCanvasSize();
    const graphEdges = this.host.getGraphEdges();
    const tagMembership = this.host.getTagMembership();

    const result = buildClusterForce(
      sim.nodes(),
      graphEdges,
      this.host.getDegrees(),
      {
        groupRules: panel.clusterGroupRules,
        arrangement: clusterArrangement,
        centerX: W / 2,
        centerY: H / 2,
        width: W,
        height: H,
        nodeSize: panel.nodeSize,
        scaleByDegree: panel.scaleByDegree,
        nodeSpacing: clusterNodeSpacing,
        groupScale: clusterGroupScale,
        groupSpacing: clusterGroupSpacing,
        tagMembership: panel.tagDisplay === "enclosure" ? tagMembership : undefined,
        enclosureSpacing: panel.enclosureSpacing,
        sortComparator: this.buildSortComparator(sim.nodes(), graphEdges),
        nodeSpacingMap: this.computeNodeSpacingMap(sim.nodes()),
      },
    );
    if (result) {
      sim.force("clusterArrangement", result.force as Force<GraphNode, GraphEdge>);
      this.host.setClusterMeta(result.metadata);
    } else {
      sim.force("clusterArrangement", null);
      this.host.setClusterMeta(null);
    }
  }

  // =========================================================================
  // Create force simulation (for force layout)
  // =========================================================================
  createForceSimulation(
    nodes: GraphNode[],
    edges: GraphEdge[],
    cx: number,
    cy: number,
  ): Simulation<GraphNode, GraphEdge> {
    const panel = this.host.getPanel();

    const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
      .force("charge", forceManyBody<GraphNode>().strength(-panel.repelForce))
      .force("center", forceCenter<GraphNode>(cx, cy).strength(panel.centerForce))
      .force("link", forceLink<GraphNode, GraphEdge>(edges)
        .id((d) => d.id)
        .distance((e) => edgeLinkDistance(e, panel.linkDistance))
        .strength((e) => edgeLinkStrength(e, panel.linkForce)))
      .force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2))
      .alphaDecay(0.08)
      .velocityDecay(0.55);

    this.host.setSimulation(sim);
    return sim;
  }
}
