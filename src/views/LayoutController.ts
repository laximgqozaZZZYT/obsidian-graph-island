import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide, type Simulation, type Force } from "d3-force";
import type { GraphNode, GraphEdge, DirectionalGravityRule, ClusterGroupRule, NodeRule } from "../types";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import type { PanelState } from "./PanelBuilder";
import { resolveDirection, matchesFilter } from "../layouts/force";
import { buildClusterForce, computeAutoFitSpacing, type ClusterMetadata } from "../layouts/cluster-force";
import { resolveCoordinateLayout } from "../layouts/coordinate-presets";
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
  /** Read a frontmatter property from a node's source file */
  getNodeProperty(nodeId: string, key: string): string | undefined;
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
    const thresholds = panel.renderThresholds ?? {};
    return (n: GraphNode) => {
      // Use actual PIXI radius if available (accounts for super node scaling + MAX cap)
      const pn = pixiNodes.get(n.id);
      if (pn) {
        // Card display mode uses larger collision radius to prevent overlap
        if (panel.nodeDisplayMode === "card") {
          const cardPad = thresholds.cardCollisionPadding ?? DEFAULT_RENDER_THRESHOLDS.cardCollisionPadding;
          return Math.max(pn.radius + PAD, cardPad);
        }
        return pn.radius + PAD;
      }
      // Fallback: compute effective radius including super node expansion
      const deg = degrees.get(n.id) || 0;
      let r = baseSize;
      if (panel.scaleByDegree) {
        r = Math.min(Math.max(baseSize, baseSize + Math.sqrt(deg) * 3.2), 30);
      }
      // Super node expansion (mirrors effectiveRadius in cluster-force.ts)
      if (n.collapsedMembers && n.collapsedMembers.length > 0) {
        r = Math.min(Math.max(r, r * (1 + Math.sqrt(n.collapsedMembers.length) * 0.5)), 30);
      }
      return r + PAD;
    };
  }

  // =========================================================================
  // Force updates (live panel adjustments)
  // =========================================================================
  updateForces() {
    const sim = this.host.getSimulation();
    if (!sim) return;
    const panel = this.host.getPanel();

    // If a cluster arrangement is active, it manages its own charge/link/center
    // forces via applyClusterForce(). Re-delegate there instead of overwriting.
    if (sim.force("clusterArrangement") != null) {
      this.applyClusterForce();
      sim.alpha(0.5).restart();
      this.host.wakeRenderLoop();
      return;
    }
    const { width: W, height: H } = this.host.getCanvasSize();
    const graphEdges = this.host.getGraphEdges();

    // Per-node repel multiplier from NodeRules
    const repelMap = this.computeNodeRepelMap(sim.nodes());
    const hasCustomRepel = repelMap.size > 0;

    sim
      .force("charge", forceManyBody<GraphNode>().strength(hasCustomRepel
        ? ((n: GraphNode) => {
            const mult = repelMap.get(n.id) ?? 1.0;
            return -panel.repelForce * mult;
          })
        : -panel.repelForce))
      .force("link", forceLink<GraphNode, GraphEdge>(graphEdges)
        .id((d) => d.id)
        .distance((e) => edgeLinkDistance(e, panel.linkDistance))
        .strength((e) => edgeLinkStrength(e, panel.linkForce)))
      .force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2));

    // Per-node center gravity from NodeRules
    const centerGravMap = this.computeCenterGravityMap(sim.nodes());
    if (centerGravMap.size > 0) {
      // Replace d3 forceCenter with custom per-node center force
      sim.force("center", null);
      const cx = W / 2, cy = H / 2;
      const centerStr = panel.centerForce;
      const centerForceFn = (alpha: number) => {
        for (const n of sim.nodes()) {
          const mult = centerGravMap.get(n.id) ?? 1.0;
          const str = centerStr * mult * alpha;
          n.vx! -= (n.x - cx) * str;
          n.vy! -= (n.y - cy) * str;
        }
      };
      sim.force("customCenter", centerForceFn as Force<GraphNode, GraphEdge>);
    } else {
      sim.force("customCenter", null);
      sim.force("center", forceCenter<GraphNode>(W / 2, H / 2).strength(panel.centerForce));
    }

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

    // Pre-compute filter matches once (instead of per-tick × per-node × per-rule)
    const nodes = sim.nodes();
    const precomputed = entries.map(entry => {
      const ddx = Math.cos(entry.angleRad);
      const ddy = Math.sin(entry.angleRad);
      const matchingIndices: number[] = [];
      for (let i = 0; i < nodes.length; i++) {
        if (matchesFilter(nodes[i], entry.filter)) matchingIndices.push(i);
      }
      return { ddx, ddy, strength: entry.strength, matchingIndices };
    });

    const forceFn = (alpha: number) => {
      const currentNodes = sim.nodes();
      for (const pre of precomputed) {
        const str = pre.strength * alpha * 100;
        for (const idx of pre.matchingIndices) {
          const node = currentNodes[idx];
          node.vx! += pre.ddx * str;
          node.vy! += pre.ddy * str;
        }
      }
    };
    sim.force("directionalGravity", forceFn as Force<GraphNode, GraphEdge>);
  }

  // =========================================================================
  // Per-node repel multiplier map (from NodeRules)
  // =========================================================================
  private computeNodeRepelMap(nodes: GraphNode[]): Map<string, number> {
    const map = new Map<string, number>();
    const rules = this.host.getPanel().nodeRules ?? [];
    if (rules.length === 0) return map;
    for (const node of nodes) {
      let mult = 1.0;
      for (const rule of rules) {
        if (matchesFilter(node, rule.query)) {
          mult *= (rule.repelMultiplier ?? 1.0);
        }
      }
      if (mult !== 1.0) map.set(node.id, mult);
    }
    return map;
  }

  // =========================================================================
  // Per-node center gravity map (from NodeRules)
  // =========================================================================
  private computeCenterGravityMap(nodes: GraphNode[]): Map<string, number> {
    const map = new Map<string, number>();
    const rules = this.host.getPanel().nodeRules ?? [];
    if (rules.length === 0) return map;
    for (const node of nodes) {
      let mult = 1.0;
      for (const rule of rules) {
        if (matchesFilter(node, rule.query)) {
          mult *= (rule.centerGravity ?? 1.0);
        }
      }
      if (mult !== 1.0) map.set(node.id, mult);
    }
    return map;
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
    let { clusterArrangement, clusterNodeSpacing, clusterGroupScale, clusterGroupSpacing } = panel;
    const grav = panel.clusterGravity ?? { interGroupAttraction: 0.5, intraGroupDensity: 1.0 };

    const chargeForce = this.host.getPanel().renderThresholds?.clusterChargeForce
      ?? DEFAULT_RENDER_THRESHOLDS.clusterChargeForce;
    sim.force("charge", forceManyBody<GraphNode>().strength(chargeForce));
    sim.force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2));
    sim.force("center", null);
    sim.force("link", null);
    sim.force("directionalGravity", null);
    sim.force("enclosureRepulsion", null);

    const { width: W, height: H } = this.host.getCanvasSize();
    const graphEdges = this.host.getGraphEdges();
    const tagMembership = this.host.getTagMembership();

    const baseCfg = {
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
      timelineKey: panel.timelineKey || "date",
      timelineEndKey: panel.timelineEndKey || "end-date",
      timelineOrderFields: panel.timelineOrderFields || "next,prev,parent_id,story_order",
      guideLineMode: panel.guideLineMode || "per-group",
      getNodeProperty: (nodeId: string, key: string) => this.host.getNodeProperty(nodeId, key),
      coordinateLayout: resolveCoordinateLayout(clusterArrangement, panel.coordinateLayout ?? null),
      userConstants: panel.coordinateLayout?.constants,
      // Arrangement presets inter-group layout mode and overlap resolution strategy
      groupLayoutMode: (
        clusterArrangement === "tree" || clusterArrangement === "mountain" ? "horizontal" :
        clusterArrangement === "concentric" ? "concentric" :
        clusterArrangement === "timeline" ? "vertical" :
        "circle"
      ) as "circle" | "horizontal" | "concentric" | "vertical",
      skipGroupOverlap: clusterArrangement === "timeline" || clusterArrangement === "sunburst",
    };

    // If coordinateLayout specifies a property source, use it as timelineKey
    const resolved = baseCfg.coordinateLayout;
    if (resolved && resolved.axis1.source.kind === "property") {
      baseCfg.timelineKey = (resolved.axis1.source as { kind: "property"; key: string }).key;
    }

    // Auto-fit: compute optimal spacing values
    if (panel.autoFit) {
      const optimal = computeAutoFitSpacing(sim.nodes(), graphEdges, this.host.getDegrees(), baseCfg);
      clusterNodeSpacing = optimal.nodeSpacing;
      clusterGroupScale = optimal.groupScale;
      clusterGroupSpacing = optimal.groupSpacing;
      // Update panel values so sliders reflect auto-computed values
      panel.clusterNodeSpacing = clusterNodeSpacing;
      panel.clusterGroupScale = clusterGroupScale;
      panel.clusterGroupSpacing = clusterGroupSpacing;
      // Apply to config
      baseCfg.nodeSpacing = clusterNodeSpacing;
      baseCfg.groupScale = clusterGroupScale;
      baseCfg.groupSpacing = clusterGroupSpacing;
    }

    // Apply cluster gravity coefficients (after auto-fit so coefficients modify final values)
    const interAttr = grav.interGroupAttraction || 0.5;
    const intraDens = grav.intraGroupDensity || 1.0;
    if (interAttr !== 1.0) {
      baseCfg.groupSpacing = baseCfg.groupSpacing / interAttr;
    }
    if (intraDens !== 1.0) {
      baseCfg.nodeSpacing = baseCfg.nodeSpacing / intraDens;
    }

    const result = buildClusterForce(
      sim.nodes(),
      graphEdges,
      this.host.getDegrees(),
      baseCfg,
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

    // Per-node repel multiplier from NodeRules
    const repelMap = this.computeNodeRepelMap(nodes);
    const hasCustomRepel = repelMap.size > 0;

    const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
      .force("charge", forceManyBody<GraphNode>().strength(hasCustomRepel
        ? ((n: GraphNode) => {
            const mult = repelMap.get(n.id) ?? 1.0;
            return -panel.repelForce * mult;
          })
        : -panel.repelForce))
      .force("link", forceLink<GraphNode, GraphEdge>(edges)
        .id((d) => d.id)
        .distance((e) => edgeLinkDistance(e, panel.linkDistance))
        .strength((e) => edgeLinkStrength(e, panel.linkForce)))
      .force("collide", forceCollide<GraphNode>().radius(this.collideRadius()).iterations(2))
      .alphaDecay(0.18)
      .velocityDecay(0.55);

    // Per-node center gravity from NodeRules
    const centerGravMap = this.computeCenterGravityMap(nodes);
    if (centerGravMap.size > 0) {
      const centerStr = panel.centerForce;
      const centerForceFn = (alpha: number) => {
        for (const n of sim.nodes()) {
          const mult = centerGravMap.get(n.id) ?? 1.0;
          const str = centerStr * mult * alpha;
          n.vx! -= (n.x - cx) * str;
          n.vy! -= (n.y - cy) * str;
        }
      };
      sim.force("customCenter", centerForceFn as Force<GraphNode, GraphEdge>);
    } else {
      sim.force("center", forceCenter<GraphNode>(cx, cy).strength(panel.centerForce));
    }

    this.host.setSimulation(sim);
    return sim;
  }
}
