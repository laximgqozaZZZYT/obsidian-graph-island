import {
	forceSimulation,
	forceManyBody,
	forceCenter,
	forceLink,
	forceCollide,
	type Simulation,
	type Force,
} from "d3-force";
import type { GraphNode, GraphEdge, DirectionalGravityRule } from "../types";
import {
	TAG_DISPLAY_ENCLOSURE,
	SOURCE_PROPERTY,
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_RADIAL,
	ARRANGEMENT_TIMELINE,
	GROUP_ARRANGEMENT_AUTO,
	GROUP_ARRANGEMENT_CONCENTRIC,
	GROUP_ARRANGEMENT_VERTICAL,
	GROUP_ARRANGEMENT_CIRCLE,
} from "../constants";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import type { PanelState } from "./PanelBuilder";
import { resolveDirection, matchesFilter } from "../layouts/force";
import {
	buildClusterForce,
	computeAutoFitSpacing,
	effectiveRadius,
	type ClusterMetadata,
} from "../layouts/cluster-force";
import { resolveCoordinateLayout } from "../layouts/coordinate-presets";
import { computeInDegree, computePropagatedImportance } from "../analysis/graph-analysis";
import { computeBBoxWithCentroid } from "../utils/geometry";
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
	/** Get ontology sequence field names (forward direction, e.g. ["next"]) */
	getSequenceFields(): string[];
	/** Get ontology reverse sequence field names (e.g. ["prev", "previous"]) */
	getReverseSequenceFields(): string[];
	/** Get current world-container zoom scale */
	getWorldScale(): number;
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
		const thresholds = panel.renderThresholds ?? {};
		const maxR = thresholds.maxNodeRadius ?? DEFAULT_RENDER_THRESHOLDS.maxNodeRadius;
		const minR = thresholds.minNodeRadius ?? DEFAULT_RENDER_THRESHOLDS.minNodeRadius;
		const collidePad = thresholds.collisionPadding ?? DEFAULT_RENDER_THRESHOLDS.collisionPadding;
		const cardCollidePad = thresholds.cardCollisionPadding ?? DEFAULT_RENDER_THRESHOLDS.cardCollisionPadding;
		const superCollidePad =
			thresholds.superNodeCollisionPadding ?? DEFAULT_RENDER_THRESHOLDS.superNodeCollisionPadding;
		const sizeByDeg = thresholds.nodeSizeByDegree ?? true;
		// Pre-compute max degree for size-by-degree calculation
		let maxDeg = 0;
		if (sizeByDeg) {
			for (const d of degrees.values()) {
				if (d > maxDeg) maxDeg = d;
			}
		}
		return (n: GraphNode) => {
			// Always compute the canonical radius (accounts for degree-proportional sizing)
			const deg = degrees.get(n.id) || 0;
			const canonicalR = effectiveRadius(n, baseSize, deg, maxR, minR, maxDeg, sizeByDeg);
			// Use whichever is larger: actual pixi radius or canonical radius
			const pn = pixiNodes.get(n.id);
			const visualR = pn ? Math.max(pn.radius, canonicalR) : canonicalR;

			if (panel.nodeDisplayMode === "card") {
				// Card mode: add extra padding to the node's visual radius.
				// Cards are counter-scaled at render time (1/zoom), so their screen
				// size depends on zoom. The collide radius works in world coords
				// and should give modest extra spacing — not the full card pixel size.
				return visualR + cardCollidePad;
			}
			if (n.collapsedMembers && n.collapsedMembers.length > 0) {
				return visualR + superCollidePad;
			}
			// Add label-aware spacing: longer labels need more room
			const labelLen = n.label?.length ?? 0;
			const labelPad = labelLen > 8 ? Math.min((labelLen - 8) * 0.8, 20) : 0;
			return visualR + collidePad + labelPad;
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
			return;
		}
		const { width: W, height: H } = this.host.getCanvasSize();
		const graphEdges = this.host.getGraphEdges();

		// Per-node repel multiplier from NodeRules
		const repelMap = this.computeNodeRepelMap(sim.nodes());
		const hasCustomRepel = repelMap.size > 0;

		// L1: Auto-adjust repelForce based on node count for consistent density
		const nodeCount = sim.nodes().length;
		// Scale down repelForce for very small node counts (< 20) to prevent
		// super-nodes from dispersing to canvas corners
		const smallGraphScale = nodeCount < 20 ? Math.max(0.1, nodeCount / 20) : 1;
		const autoRepel =
			nodeCount > 0
				? Math.max(50, Math.min(panel.repelForce, (400 / Math.sqrt(nodeCount)) * (panel.repelForce / 200))) *
					smallGraphScale
				: panel.repelForce;

		sim.force(
			"charge",
			forceManyBody<GraphNode>().strength(
				hasCustomRepel
					? (n: GraphNode) => {
							const mult = repelMap.get(n.id) ?? 1.0;
							return -autoRepel * mult;
						}
					: -autoRepel,
			),
		)
			.force(
				"link",
				forceLink<GraphNode, GraphEdge>(graphEdges)
					.id((d) => d.id)
					.distance((e) => edgeLinkDistance(e, panel.linkDistance))
					.strength((e) => edgeLinkStrength(e, panel.linkForce)),
			)
			.force(
				"collide",
				forceCollide<GraphNode>()
					.radius(this.collideRadius())
					.iterations(panel.nodeDisplayMode === "card" ? 20 : 8),
			);

		// Per-node center gravity from NodeRules
		const centerGravMap = this.computeCenterGravityMap(sim.nodes());
		if (centerGravMap.size > 0) {
			// Replace d3 forceCenter with custom per-node center force
			sim.force("center", null);
			const cx = W / 2,
				cy = H / 2;
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
		const precomputed = entries.map((entry) => {
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
	// Generic per-node rule multiplier map (from NodeRules)
	// =========================================================================
	private computeNodeRuleMap(
		nodes: GraphNode[],
		ruleKey: "repelMultiplier" | "centerGravity" | "spacingMultiplier",
	): Map<string, number> {
		const map = new Map<string, number>();
		const rules = this.host.getPanel().nodeRules ?? [];
		if (rules.length === 0) return map;
		for (const node of nodes) {
			let mult = 1.0;
			for (const rule of rules) {
				if (matchesFilter(node, rule.query)) {
					mult *= rule[ruleKey] ?? 1.0;
				}
			}
			if (mult !== 1.0) map.set(node.id, mult);
		}
		return map;
	}

	private computeNodeRepelMap(nodes: GraphNode[]) {
		return this.computeNodeRuleMap(nodes, "repelMultiplier");
	}
	private computeCenterGravityMap(nodes: GraphNode[]) {
		return this.computeNodeRuleMap(nodes, "centerGravity");
	}
	computeNodeSpacingMap(nodes: GraphNode[]) {
		return this.computeNodeRuleMap(nodes, "spacingMultiplier");
	}

	// =========================================================================
	// Enclosure repulsion force
	// =========================================================================
	applyEnclosureRepulsionForce() {
		const sim = this.host.getSimulation();
		if (!sim) return;
		const panel = this.host.getPanel();
		const tagMembership = this.host.getTagMembership();

		if (panel.tagDisplay !== TAG_DISPLAY_ENCLOSURE || tagMembership.size === 0) {
			sim.force("enclosureRepulsion", null);
			return;
		}

		const nodeIndex = new Map<string, GraphNode>();
		for (const n of sim.nodes()) {
			nodeIndex.set(n.id, n);
		}

		const relPairs = this.host.getTagRelPairsCache();

		// Pre-compute node references per tag (outside tick closure to avoid per-tick allocation)
		const tagNodes: { tag: string; nodes: GraphNode[] }[] = [];
		for (const [tag, ids] of tagMembership) {
			if (!ids || ids.size === 0) continue;
			const nodes: GraphNode[] = [];
			for (const id of ids) {
				const n = nodeIndex.get(id);
				if (n) nodes.push(n);
			}
			if (nodes.length > 0) tagNodes.push({ tag, nodes });
		}

		const PHASE_THRESHOLD = 0.3;

		const forceFn = (alpha: number) => {
			const userSpacing = panel.enclosureSpacing;
			const effectiveSpacing = alpha > PHASE_THRESHOLD ? userSpacing * 3 : userSpacing;
			const baseStr = alpha > PHASE_THRESHOLD ? 4000 : 2000;

			const centroids: { tag: string; cx: number; cy: number; count: number; radius: number }[] = [];
			for (const { tag, nodes } of tagNodes) {
				const bb = computeBBoxWithCentroid(nodes);
				const r = Math.max(30, Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2);
				centroids.push({ tag, cx: bb.cx, cy: bb.cy, count: bb.count, radius: r });
			}

			const repStr = baseStr * alpha;
			for (let i = 0; i < centroids.length; i++) {
				for (let j = i + 1; j < centroids.length; j++) {
					const a = centroids[i],
						b = centroids[j];
					if (relPairs.has(`${a.tag}\0${b.tag}`)) continue;

					const dx = b.cx - a.cx;
					const dy = b.cy - a.cy;
					const desiredDist = (a.radius + b.radius) * effectiveSpacing;
					let dist = Math.sqrt(dx * dx + dy * dy);
					if (dist >= desiredDist) continue;
					if (dist < 1) dist = 1;

					const overlap = desiredDist - dist;
					const force = (repStr * overlap) / dist;
					const fx = (dx * force) / dist;
					const fy = (dy * force) / dist;

					const wA = 1 / a.count;
					const wB = 1 / b.count;
					const idsA = tagMembership.get(a.tag)!;
					const idsB = tagMembership.get(b.tag)!;
					for (const id of idsA) {
						const n = nodeIndex.get(id);
						if (n) {
							n.vx! -= fx * wA;
							n.vy! -= fy * wA;
						}
					}
					for (const id of idsB) {
						const n = nodeIndex.get(id);
						if (n) {
							n.vx! += fx * wB;
							n.vy! += fy * wB;
						}
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
		const needsInDegree = rules.some((r) => r.key === "in-degree");
		const needsImportance = rules.some((r) => r.key === "importance");
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
			if (!s) {
				s = { sx: 0, sy: 0, cnt: 0 };
				sums.set(clusterKey, s);
			}
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
	applyClusterForce(resetPositions = true) {
		const sim = this.host.getSimulation();
		if (!sim) return;
		const panel = this.host.getPanel();
		const { clusterArrangement } = panel;
		const grav = panel.clusterGravity ?? { interGroupAttraction: 0.5, intraGroupDensity: 1.0 };

		const chargeForce = panel.renderThresholds?.clusterChargeForce ?? DEFAULT_RENDER_THRESHOLDS.clusterChargeForce;
		// Scale down charge for very small node counts (< 20) to prevent
		// super-nodes from dispersing to canvas corners
		const clusterNodeCount = sim.nodes().length;
		const clusterSmallScale = clusterNodeCount < 20 ? Math.max(0.1, clusterNodeCount / 20) : 1;
		// Scale charge by node radius for super nodes (collapsed groups need stronger repulsion)
		const pixiNodesForCharge = this.host.getPixiNodes();
		sim.force(
			"charge",
			forceManyBody<GraphNode>().strength((n: GraphNode) => {
				const pn = pixiNodesForCharge.get(n.id);
				if (pn && n.collapsedMembers && n.collapsedMembers.length > 0) {
					return chargeForce * (pn.radius / 10) * clusterSmallScale;
				}
				return chargeForce * clusterSmallScale;
			}),
		);
		sim.force(
			"collide",
			forceCollide<GraphNode>()
				.radius(this.collideRadius())
				.iterations(panel.nodeDisplayMode === "card" ? 20 : 8),
		);
		sim.force("center", null);
		sim.force("link", null);
		sim.force("directionalGravity", null);
		sim.force("enclosureRepulsion", null);

		const { width: W, height: H } = this.host.getCanvasSize();
		const cx = W / 2,
			cy = H / 2;

		// Reset velocities and release pinned nodes.
		// When resetPositions=true (arrangement change), also reset positions to center.
		for (const n of sim.nodes()) {
			if (resetPositions) {
				n.x = cx + (Math.random() - 0.5) * 2;
				n.y = cy + (Math.random() - 0.5) * 2;
			}
			n.vx = 0;
			n.vy = 0;
			n.fx = null;
			n.fy = null;
		}
		const graphEdges = this.host.getGraphEdges();
		const tagMembership = this.host.getTagMembership();

		// When groupBy is inactive and clusterFollowsGroupBy is on, auto-derive
		// folder-based cluster rules so nodes are spatially grouped by folder.
		// Only activate if multiple distinct top-level folders exist in the current nodes.
		const hasActiveGroupBy = panel.groupBy && panel.groupBy !== "none";
		let isAutoFolder = !hasActiveGroupBy && panel.clusterFollowsGroupBy;
		if (isAutoFolder) {
			const folders = new Set<string>();
			for (const n of sim.nodes()) {
				const fp = n.filePath ?? "";
				const slash = fp.indexOf("/");
				folders.add(slash > 0 ? fp.substring(0, slash) : "/");
				if (folders.size >= 3) break; // enough to confirm multiple folders
			}
			if (folders.size < 3) isAutoFolder = false; // single/two folders → no clustering needed
		}
		const effectiveGroupRules = isAutoFolder
			? [{ groupBy: "folder" as const, recursive: false }]
			: panel.clusterGroupRules;

		const baseCfg = {
			groupRules: effectiveGroupRules,
			arrangement: clusterArrangement,
			centerX: W / 2,
			centerY: H / 2,
			width: W,
			height: H,
			nodeSize: panel.nodeSize,
			nodeSpacing: isAutoFolder ? 1.0 : (panel.clusterNodeSpacing ?? 3),
			groupScale: isAutoFolder ? 1.0 : (panel.clusterGroupScale ?? 3),
			groupSpacing: isAutoFolder ? 0.5 : (panel.clusterGroupSpacing ?? 2),
			tagMembership: panel.tagDisplay === TAG_DISPLAY_ENCLOSURE ? tagMembership : undefined,
			enclosureSpacing: panel.enclosureSpacing,
			sortComparator: this.buildSortComparator(sim.nodes(), graphEdges),
			nodeSpacingMap: this.computeNodeSpacingMap(sim.nodes()),
			timelineKey: panel.timelineKey || "date",
			timelineEndKey: panel.timelineEndKey || "end-date",
			timelineOrderFields: panel.timelineOrderFields || "",
			sequenceFields: this.host.getSequenceFields(),
			reverseSequenceFields: this.host.getReverseSequenceFields(),
			getNodeProperty: (nodeId: string, key: string) => this.host.getNodeProperty(nodeId, key),
			coordinateLayout: resolveCoordinateLayout(clusterArrangement, panel.coordinateLayout ?? null),
			userConstants: panel.coordinateLayout?.constants,
			// Inter-group layout: explicit setting overrides auto-derived mode
			groupLayoutMode: (panel.clusterGroupArrangement && panel.clusterGroupArrangement !== GROUP_ARRANGEMENT_AUTO
				? panel.clusterGroupArrangement
				: clusterArrangement === ARRANGEMENT_CONCENTRIC || clusterArrangement === ARRANGEMENT_RADIAL
					? GROUP_ARRANGEMENT_CONCENTRIC
					: clusterArrangement === ARRANGEMENT_TIMELINE
						? GROUP_ARRANGEMENT_VERTICAL
						: GROUP_ARRANGEMENT_CIRCLE) as "circle" | "horizontal" | "concentric" | "vertical" | "grid",
			skipGroupOverlap: clusterArrangement === ARRANGEMENT_TIMELINE,
			maxNodeRadius: panel.renderThresholds?.maxNodeRadius ?? DEFAULT_RENDER_THRESHOLDS.maxNodeRadius,
			minNodeRadius: panel.renderThresholds?.minNodeRadius ?? DEFAULT_RENDER_THRESHOLDS.minNodeRadius,
			repelForce: panel.repelForce,
			blendConfig: {
				clusterBlendDefault: panel.renderThresholds?.clusterBlendDefault,
				clusterBlendDecayFactor: panel.renderThresholds?.clusterBlendDecayFactor,
			},
			normalizeArrangementSpread: panel.renderThresholds?.normalizeArrangementSpread,
			labelSpacingFactor:
				panel.renderThresholds?.labelSpacingFactor ?? DEFAULT_RENDER_THRESHOLDS.labelSpacingFactor,
			nodeLabelFontSizeMin:
				panel.renderThresholds?.nodeLabelFontSizeMin ?? DEFAULT_RENDER_THRESHOLDS.nodeLabelFontSizeMin,
			nodeLabelFontSizeMax:
				panel.renderThresholds?.nodeLabelFontSizeMax ?? DEFAULT_RENDER_THRESHOLDS.nodeLabelFontSizeMax,
			orphanClusterField: panel.orphanClusterField || undefined,
		};

		// If coordinateLayout specifies a property source, use it as timelineKey
		const resolved = baseCfg.coordinateLayout;
		if (resolved && resolved.axis1.source.kind === SOURCE_PROPERTY) {
			baseCfg.timelineKey = (resolved.axis1.source as { kind: typeof SOURCE_PROPERTY; key: string }).key;
		}

		// Auto-fit: compute optimal spacing values
		if (panel.autoFit) {
			const optimal = computeAutoFitSpacing(sim.nodes(), graphEdges, this.host.getDegrees(), baseCfg);
			// Update panel values so sliders reflect auto-computed values
			panel.clusterNodeSpacing = optimal.nodeSpacing;
			panel.clusterGroupScale = optimal.groupScale;
			panel.clusterGroupSpacing = optimal.groupSpacing;
			// Apply to config
			baseCfg.nodeSpacing = optimal.nodeSpacing;
			baseCfg.groupScale = optimal.groupScale;
			baseCfg.groupSpacing = optimal.groupSpacing;
		}

		// Apply cluster gravity coefficients (after auto-fit so coefficients modify final values)
		const interAttr = Math.max(0.01, grav.interGroupAttraction ?? 0.5);
		const intraDens = Math.max(0.01, grav.intraGroupDensity ?? 1.0);
		if (interAttr !== 1.0) {
			baseCfg.groupSpacing = baseCfg.groupSpacing / interAttr;
		}
		if (intraDens !== 1.0) {
			baseCfg.nodeSpacing = baseCfg.nodeSpacing / intraDens;
		}

		const result = buildClusterForce(sim.nodes(), graphEdges, this.host.getDegrees(), baseCfg);
		if (result) {
			sim.force("clusterArrangement", result.force as Force<GraphNode, GraphEdge>);
			this.host.setClusterMeta(result.metadata);
		} else {
			sim.force("clusterArrangement", null);
			this.host.setClusterMeta(null);
		}

		// Reheat simulation: alpha=1.0 for full reset, 0.5 for parameter-only changes
		sim.alpha(resetPositions ? 1.0 : 0.5).restart();
		this.host.wakeRenderLoop();
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

		// Scale down repelForce for very small node counts (< 20) to prevent
		// super-nodes from dispersing to canvas corners
		const initSmallScale = nodes.length < 20 ? Math.max(0.1, nodes.length / 20) : 1;
		const initRepel = panel.repelForce * initSmallScale;

		const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
			.force(
				"charge",
				forceManyBody<GraphNode>().strength(
					hasCustomRepel
						? (n: GraphNode) => {
								const mult = repelMap.get(n.id) ?? 1.0;
								return -initRepel * mult;
							}
						: -initRepel,
				),
			)
			.force(
				"link",
				forceLink<GraphNode, GraphEdge>(edges)
					.id((d) => d.id)
					.distance((e) => edgeLinkDistance(e, panel.linkDistance))
					.strength((e) => edgeLinkStrength(e, panel.linkForce)),
			)
			.force(
				"collide",
				forceCollide<GraphNode>()
					.radius(this.collideRadius())
					.iterations(panel.nodeDisplayMode === "card" ? 20 : 8),
			)
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
