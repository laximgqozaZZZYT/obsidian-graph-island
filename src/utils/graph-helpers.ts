import type { GraphData, GraphNode, GraphEdge } from "../types";
import { hexToRgb } from "./color";

/**
 * Extract node ID from a d3-force edge endpoint.
 * During simulation, d3 replaces string IDs with node objects.
 */
export function edgeSourceId(e: { source: string | { id: string } }): string {
	return typeof e.source === "string" ? e.source : e.source.id;
}

export function edgeTargetId(e: { target: string | { id: string } }): string {
	return typeof e.target === "string" ? e.target : e.target.id;
}

/** Increment a Map<K, number> counter by `delta` (default 1). */
export function incCounter<K>(map: Map<K, number>, key: K, delta = 1): void {
	map.set(key, (map.get(key) ?? 0) + delta);
}

export function yieldFrame(): Promise<void> {
	return new Promise((r) => requestAnimationFrame(() => r()));
}

export function buildAdj(gd: GraphData): Map<string, Set<string>> {
	const adj = new Map<string, Set<string>>();
	for (const n of gd.nodes) adj.set(n.id, new Set());
	for (const e of gd.edges) {
		adj.get(e.source)?.add(e.target);
		adj.get(e.target)?.add(e.source);
	}
	return adj;
}

/** Edge type key → GraphEdge.type value mapping for hover filter. */
const HOVER_EDGE_TYPE_MAP: Record<string, string> = {
	link: "link",
	semantic: "semantic",
	tag: "tag",
	hasTag: "has-tag",
	similar: "similar",
	sibling: "sibling",
	sequence: "sequence",
	inheritance: "inheritance",
	aggregation: "aggregation",
};

/**
 * Build adjacency list filtered by allowed edge types.
 * Used for hover highlight BFS — only traverses edges the user has enabled.
 */
export function buildAdjFiltered(gd: GraphData, allowedTypes: Record<string, boolean>): Map<string, Set<string>> {
	const allowed = new Set<string>();
	for (const [key, enabled] of Object.entries(allowedTypes)) {
		if (enabled) {
			const mapped = HOVER_EDGE_TYPE_MAP[key];
			if (mapped) allowed.add(mapped);
		}
	}
	const adj = new Map<string, Set<string>>();
	for (const n of gd.nodes) adj.set(n.id, new Set());
	for (const e of gd.edges) {
		const edgeType = e.type ?? "link";
		if (!allowed.has(edgeType)) continue;
		adj.get(e.source)?.add(e.target);
		adj.get(e.target)?.add(e.source);
	}
	return adj;
}

/**
 * Build adjacency list from separate node and edge arrays.
 * Returns Map<string, string[]> (array-based for iteration efficiency).
 */
export function buildAdjFromEdges(
	nodes: { id: string }[],
	edges: { source: string; target: string }[],
): Map<string, string[]> {
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n.id, []);
	for (const e of edges) {
		adj.get(e.source)?.push(e.target);
		adj.get(e.target)?.push(e.source);
	}
	return adj;
}

// ---------------------------------------------------------------------------
// BFS utilities — consolidated from 5 duplicate implementations
// ---------------------------------------------------------------------------

/** BFS N-hop neighbor set from a starting node. Returns Set of reachable node IDs (including start). */
export function bfsNeighborSet(adj: Map<string, Set<string>>, startId: string, maxHops: number): Set<string> {
	const visited = new Set<string>();
	visited.add(startId);
	let frontier = [startId];
	for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
		const next: string[] = [];
		for (const id of frontier) {
			const nb = adj.get(id);
			if (!nb) continue;
			for (const n of nb) {
				if (!visited.has(n)) {
					visited.add(n);
					next.push(n);
				}
			}
		}
		frontier = next;
	}
	return visited;
}

/** BFS shortest path between two nodes. Returns node ID array (start→end), or empty if unreachable. */
export function bfsShortestPath(adj: Map<string, Set<string>>, startId: string, endId: string): string[] {
	if (startId === endId) return [startId];
	const prev = new Map<string, string>();
	const visited = new Set<string>([startId]);
	const queue = [startId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		const nb = adj.get(current);
		if (!nb) continue;
		for (const n of nb) {
			if (visited.has(n)) continue;
			visited.add(n);
			prev.set(n, current);
			if (n === endId) {
				// Reconstruct path
				const path: string[] = [endId];
				let cursor = endId;
				while (prev.has(cursor)) {
					cursor = prev.get(cursor)!;
					path.unshift(cursor);
				}
				return path;
			}
			queue.push(n);
		}
	}
	return []; // Unreachable
}

/**
 * Yen's K-shortest simple paths algorithm (unweighted BFS variant).
 * Returns up to `k` shortest paths from start to end, each as a node ID array.
 * Falls back to BFS for k=1.
 */
export function cssColorToHex(css: string): number {
	if (css.startsWith("#")) {
		return parseInt(css.slice(1), 16);
	}
	const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
	if (m) {
		return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
	}
	return 0x6366f1;
}

/**
 * Shift the hue of a 0xRRGGBB color by `degrees` (0–360).
 * Used to generate enclosure colors that are visually distinct from node colors.
 */
export function shiftHue(hex: number, degrees: number): number {
	const { r: ri, g: gi, b: bi } = hexToRgb(hex);
	const r = ri / 255;
	const g = gi / 255;
	const b = bi / 255;

	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	const s = max === 0 ? 0 : d / max;
	const v = max;

	if (d > 0) {
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) h = ((b - r) / d + 2) / 6;
		else h = ((r - g) / d + 4) / 6;
	}

	h = ((h * 360 + degrees) % 360) / 360;
	if (h < 0) h += 1;

	// HSV to RGB
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);

	let ro: number, go: number, bo: number;
	switch (i % 6) {
		case 0:
			ro = v;
			go = t;
			bo = p;
			break;
		case 1:
			ro = q;
			go = v;
			bo = p;
			break;
		case 2:
			ro = p;
			go = v;
			bo = t;
			break;
		case 3:
			ro = p;
			go = q;
			bo = v;
			break;
		case 4:
			ro = t;
			go = p;
			bo = v;
			break;
		default:
			ro = v;
			go = p;
			bo = q;
			break;
	}

	return (Math.round(ro * 255) << 16) | (Math.round(go * 255) << 8) | Math.round(bo * 255);
}

/**
 * Convert HSL values to a 0xRRGGBB hex color.
 * h: 0–360, s: 0–1, l: 0–1.
 */
export function hslToHex(h: number, s: number, l: number): number {
	h = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0,
		g = 0,
		b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/**
 * Deterministic hash of a string to a number in [0, range).
 * Uses djb2 algorithm for fast, well-distributed hashing.
 */
export function stringHash(str: string, range: number): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
	}
	return ((hash % range) + range) % range;
}

// ---------------------------------------------------------------------------
// Feature CY: Subgraph Export
// ---------------------------------------------------------------------------

/**
 * Collect an N-hop subgraph around a starting node.
 * Returns the subset of nodes and edges within the hop radius.
 */
export function collectSubgraph(
	adj: Map<string, Set<string>>,
	startId: string,
	hops: number,
	nodes: GraphNode[],
	edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const nodeSet = bfsNeighborSet(adj, startId, hops);
	const subNodes = nodes.filter((n) => nodeSet.has(n.id));
	const subEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
	return { nodes: subNodes, edges: subEdges };
}

/**
 * Serialize a subgraph to a clean JSON string for export.
 */
export function exportSubgraphJSON(subgraph: { nodes: GraphNode[]; edges: GraphEdge[] }): string {
	return JSON.stringify(
		{
			nodes: subgraph.nodes.map((n) => ({
				id: n.id,
				label: n.label,
				tags: n.tags,
				category: n.category,
			})),
			edges: subgraph.edges.map((e) => ({
				source: e.source,
				target: e.target,
				type: e.type,
			})),
		},
		null,
		2,
	);
}

/** Export full graph as JSON with coordinates and metadata */
export function exportFullGraphJSON(nodes: GraphNode[], edges: GraphEdge[]): string {
	return JSON.stringify(
		{
			nodes: nodes.map((n) => ({
				id: n.id,
				label: n.label,
				x: Math.round(n.x * 10) / 10,
				y: Math.round(n.y * 10) / 10,
				tags: n.tags,
				category: n.category,
				filePath: n.filePath,
				isTag: n.isTag,
				meta: n.meta,
			})),
			edges: edges.map((e) => ({
				source: edgeSourceId(e),
				target: edgeTargetId(e),
				type: e.type,
				label: e.label,
			})),
			exportedAt: new Date().toISOString(),
			nodeCount: nodes.length,
			edgeCount: edges.length,
		},
		null,
		2,
	);
}

/** Export graph as CSV (nodes + edges). Accessible format for data tools. */
export function exportGraphCSV(nodes: GraphNode[], edges: GraphEdge[]): string {
	const lines: string[] = [];
	lines.push("# Nodes");
	lines.push("id,label,category,tags,x,y");
	for (const n of nodes) {
		const tags = (n.tags ?? []).join(";");
		const label = n.label.replace(/,/g, " ");
		lines.push(`${n.id},${label},${n.category ?? ""},${tags},${Math.round(n.x)},${Math.round(n.y)}`);
	}
	lines.push("");
	lines.push("# Edges");
	lines.push("source,target,type,label");
	for (const e of edges) {
		const src = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		lines.push(`${src},${tgt},${e.type ?? "link"},${(e.label ?? "").replace(/,/g, " ")}`);
	}
	return lines.join("\n");
}

/** Export graph as Mermaid flowchart syntax (max 200 nodes, 500 edges). */
export function exportGraphMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
	const lines: string[] = ["graph LR"];
	const nodeSlice = nodes.slice(0, 200);
	const nodeIds = new Set(nodeSlice.map((n) => n.id));
	for (const n of nodeSlice) {
		const safe = n.label.replace(/["[\]()]/g, "");
		const mid = n.id.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
		lines.push(`  ${mid}["${safe}"]`);
	}
	let ec = 0;
	for (const e of edges) {
		if (ec >= 500) break;
		const src = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		if (!nodeIds.has(src) || !nodeIds.has(tgt)) continue;
		const srcM = src.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
		const tgtM = tgt.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
		const arrow = e.type === "inheritance" ? "-->|is-a|" : e.type === "aggregation" ? "-->|has-a|" : "-->";
		lines.push(`  ${srcM} ${arrow} ${tgtM}`);
		ec++;
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// SVG export — pure function for graph-to-SVG conversion
// ---------------------------------------------------------------------------

export interface SvgExportOptions {
	width?: number;
	height?: number;
	/** Background color (CSS). Empty string = transparent. */
	background?: string;
	/** Node radius in SVG units. */
	nodeRadius?: number;
	/** Whether to include labels. */
	showLabels?: boolean;
	/** Edge opacity (0-1). */
	edgeAlpha?: number;
}

/** Build a Map from node ID → {x, y} for nodes that have valid coordinates. */
export function buildPositionMap(
	nodes: ReadonlyArray<{ id: string; x?: number; y?: number }>,
): Map<string, { x: number; y: number }> {
	const posMap = new Map<string, { x: number; y: number }>();
	for (const n of nodes) {
		if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y });
	}
	return posMap;
}

/** Compute bounding-box-based scale and translate functions for SVG export. */
export function computeSvgViewBox(
	posMap: ReadonlyMap<string, { x: number; y: number }>,
	width: number,
	height: number,
	pad = 40,
): { tx: (x: number) => number; ty: (y: number) => number } {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const { x, y } of posMap.values()) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	if (!isFinite(minX)) {
		minX = 0;
		minY = 0;
		maxX = width;
		maxY = height;
	}
	const dataW = maxX - minX || 1;
	const dataH = maxY - minY || 1;
	const scale = Math.min((width - pad * 2) / dataW, (height - pad * 2) / dataH);
	return {
		tx: (x: number) => pad + (x - minX) * scale,
		ty: (y: number) => pad + (y - minY) * scale,
	};
}

/** Convert an optional numeric color (0xRRGGBB) to a CSS hex string. */
export function nodeColorHex(color: number | undefined | null, fallback = "#60a5fa"): string {
	return color != null ? `#${(color & 0xffffff).toString(16).padStart(6, "0")}` : fallback;
}

/** Convert graph nodes + edges to an SVG string.
 *  Nodes must have x, y coordinates (from layout). */
export function exportGraphSVG(
	nodes: { id: string; label?: string; x?: number; y?: number; color?: number }[],
	edges: { source: string | { id: string }; target: string | { id: string }; type?: string }[],
	opts: SvgExportOptions = {},
): string {
	const {
		width = 800,
		height = 600,
		background = "#1e1e2e",
		nodeRadius = 5,
		showLabels = true,
		edgeAlpha = 0.4,
	} = opts;

	const posMap = buildPositionMap(nodes);
	const { tx, ty } = computeSvgViewBox(posMap, width, height);

	const lines: string[] = [];
	lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`);
	if (background) {
		lines.push(`  <rect width="100%" height="100%" fill="${background}"/>`);
	}

	// Edges
	lines.push(`  <g class="edges" stroke="#888" stroke-width="0.5" opacity="${edgeAlpha}">`);
	for (const e of edges) {
		const sp = posMap.get(edgeSourceId(e));
		const tp = posMap.get(edgeTargetId(e));
		if (!sp || !tp) continue;
		lines.push(
			`    <line x1="${tx(sp.x).toFixed(1)}" y1="${ty(sp.y).toFixed(1)}" x2="${tx(tp.x).toFixed(1)}" y2="${ty(tp.y).toFixed(1)}"/>`,
		);
	}
	lines.push(`  </g>`);

	// Nodes
	lines.push(`  <g class="nodes">`);
	for (const n of nodes) {
		const p = posMap.get(n.id);
		if (!p) continue;
		lines.push(
			`    <circle cx="${tx(p.x).toFixed(1)}" cy="${ty(p.y).toFixed(1)}" r="${nodeRadius}" fill="${nodeColorHex(n.color)}"/>`,
		);
	}
	lines.push(`  </g>`);

	// Labels
	if (showLabels) {
		lines.push(`  <g class="labels" font-size="10" fill="#cdd6f4" font-family="sans-serif">`);
		for (const n of nodes) {
			const p = posMap.get(n.id);
			if (!p) continue;
			const label = (n.label ?? n.id).replace(/[<>&"]/g, "");
			lines.push(
				`    <text x="${tx(p.x).toFixed(1)}" y="${(ty(p.y) - nodeRadius - 2).toFixed(1)}" text-anchor="middle">${label}</text>`,
			);
		}
		lines.push(`  </g>`);
	}

	lines.push(`</svg>`);
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tooltip text helpers (extracted from _createHoverTooltip for testability)
// ---------------------------------------------------------------------------

/** Build edge type summary for a node (e.g. "link:3 tag:2"). */
export function edgeTypeSummary(
	edges: { source: string; target: string; type?: string }[],
	nodeId: string,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const e of edges) {
		if (e.source === nodeId || e.target === nodeId) {
			const t = e.type ?? "link";
			incCounter(counts, t);
		}
	}
	return counts;
}

/** Build collapsed group summary text (e.g. "[4 nodes]\nA, B, C +1"). */
export function collapsedGroupSummary(members: string[]): string {
	if (members.length === 0) return "";
	let text = `[${members.length} nodes]`;
	const top3 = members.slice(0, 3).map((m) => m.replace(/\.md$/, ""));
	text += "\n" + top3.join(", ");
	if (members.length > 3) text += ` +${members.length - 3}`;
	return text;
}

/** Truncate a breadcrumb path for display: keep first 2 + last 2 with "…". */
export function truncateBreadcrumb(path: string[]): string[] {
	if (path.length <= 5) return path;
	return [...path.slice(0, 2), "…", ...path.slice(-2)];
}

// ---------------------------------------------------------------------------
// Pure functions extracted from GraphViewContainer
// ---------------------------------------------------------------------------

/**
 * Compute structural gaps: pairs of nodes that share a tag and have a
 * common neighbor but are not directly connected (max 20 results).
 */
export function computeGaps(
	nodes: Iterable<{ id: string; tags?: string[] }>,
	adj: Map<string, Set<string>>,
): { from: string; to: string }[] {
	const gaps: { from: string; to: string }[] = [];
	const tagMap = new Map<string, Set<string>>();
	for (const n of nodes) {
		for (const tag of n.tags ?? []) {
			if (!tagMap.has(tag)) tagMap.set(tag, new Set());
			tagMap.get(tag)!.add(n.id);
		}
	}
	for (const [, members] of tagMap) {
		const arr = [...members];
		for (let i = 0; i < arr.length && gaps.length < 20; i++) {
			for (let j = i + 1; j < arr.length && gaps.length < 20; j++) {
				const a = arr[i],
					b = arr[j];
				if (adj.get(a)?.has(b)) continue;
				const nbA = adj.get(a) ?? new Set();
				const nbB = adj.get(b) ?? new Set();
				for (const n of nbA) {
					if (nbB.has(n)) {
						gaps.push({ from: a, to: b });
						break;
					}
				}
			}
		}
	}
	return gaps;
}

/**
 * Hit-test timeline bars at a given world coordinate.
 * Returns the node ID of the bar that contains (wx, wy), or null.
 */
export function hitTestTimelineBars(
	bars: readonly { nodeId: string; xStart: number; xEnd: number; yCenter: number; barHeight: number }[],
	wx: number,
	wy: number,
): string | null {
	for (const bar of bars) {
		const halfH = bar.barHeight / 2;
		if (wx >= bar.xStart && wx <= bar.xEnd && wy >= bar.yCenter - halfH && wy <= bar.yCenter + halfH) {
			return bar.nodeId;
		}
	}
	return null;
}

/**
 * Compute auto edge-bundle strength based on node count.
 * Returns a value between 0.3 and 0.85.
 */
export function autoBundleStrength(nodeCount: number): number {
	if (nodeCount > 500) return 0.85;
	if (nodeCount > 200) return 0.7;
	if (nodeCount > 50) return 0.5;
	return 0.3;
}

/* ------------------------------------------------------------------ */
/*  Pure geometry / graph-metadata helpers (extracted from GVC)        */
/* ------------------------------------------------------------------ */

export interface BBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * Compute axis-aligned bounding box for a set of nodes with radii.
 * Returns Infinity/-Infinity bounds when the input is empty.
 */
export function computeNodeBBox(nodes: readonly { x: number; y: number; radius?: number }[], defaultRadius = 12): BBox {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const n of nodes) {
		const r = n.radius ?? defaultRadius;
		minX = Math.min(minX, n.x - r);
		minY = Math.min(minY, n.y - r);
		maxX = Math.max(maxX, n.x + r);
		maxY = Math.max(maxY, n.y + r);
	}
	return { minX, minY, maxX, maxY };
}

/**
 * Build tag membership map: assigns each non-tag node to its most specific
 * (smallest-count) tag. Also builds tag relationship pairs cache from
 * inheritance/aggregation edges between tag nodes.
 */
export function buildTagMembership(
	nodes: readonly GraphNode[],
	edges: readonly GraphEdge[],
): { tagMembership: Map<string, Set<string>>; tagRelPairs: Set<string> } {
	const tagMembership = new Map<string, Set<string>>();
	const tagRelPairs = new Set<string>();

	// Pass 1: count members per tag to determine specificity
	const tagCounts = new Map<string, number>();
	for (const n of nodes) {
		if (n.isTag || !n.tags) continue;
		for (const tag of n.tags) {
			incCounter(tagCounts, tag);
		}
	}
	// Pass 2: assign each node to ONLY its most specific (smallest) tag
	for (const n of nodes) {
		if (n.isTag || !n.tags || n.tags.length === 0) continue;
		let bestTag = n.tags[0];
		let bestCount = tagCounts.get(bestTag) ?? Infinity;
		for (let i = 1; i < n.tags.length; i++) {
			const c = tagCounts.get(n.tags[i]) ?? Infinity;
			if (c < bestCount) {
				bestCount = c;
				bestTag = n.tags[i];
			}
		}
		if (!tagMembership.has(bestTag)) tagMembership.set(bestTag, new Set());
		tagMembership.get(bestTag)!.add(n.id);
	}
	// Build tag relationship pairs from inheritance/aggregation edges
	for (const e of edges) {
		if (e.type !== "inheritance" && e.type !== "aggregation") continue;
		const src = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		if (src?.startsWith("tag:") && tgt?.startsWith("tag:")) {
			const t1 = src.slice(4),
				t2 = tgt.slice(4);
			tagRelPairs.add(`${t1}\0${t2}`);
			tagRelPairs.add(`${t2}\0${t1}`);
		}
	}

	return { tagMembership, tagRelPairs };
}

/**
 * Build the set of node IDs that share at least one tag with another node
 * but have no direct edge between them (missing neighbor detection).
 */
export function buildMissingNeighborSet(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Set<string> | null {
	// Build tag → nodeIds map
	const tagToNodes = new Map<string, string[]>();
	for (const n of nodes) {
		if (n.isTag || !n.tags) continue;
		for (const tag of n.tags) {
			let arr = tagToNodes.get(tag);
			if (!arr) {
				arr = [];
				tagToNodes.set(tag, arr);
			}
			arr.push(n.id);
		}
	}

	// Build edge adjacency set for O(1) lookup
	const edgeSet = new Set<string>();
	for (const e of edges) {
		const s = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
		const t = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
		edgeSet.add(s < t ? `${s}\0${t}` : `${t}\0${s}`);
	}

	// For each tag group, find pairs with no edge → mark both nodes
	const result = new Set<string>();
	for (const [, nodeIds] of tagToNodes) {
		if (nodeIds.length < 2) continue;
		const len = Math.min(nodeIds.length, 200);
		for (let i = 0; i < len; i++) {
			let hasMissingPair = false;
			for (let j = i + 1; j < len; j++) {
				const a = nodeIds[i],
					b = nodeIds[j];
				const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
				if (!edgeSet.has(key)) {
					hasMissingPair = true;
					result.add(b);
				}
			}
			if (hasMissingPair) result.add(nodeIds[i]);
		}
	}

	return result.size > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Auto-fit view transform computation
// ---------------------------------------------------------------------------

export interface AutoFitInput {
	/** Node positions and radii */
	nodes: { x: number; y: number; r: number }[];
	/** Canvas width */
	canvasW: number;
	/** Canvas height */
	canvasH: number;
	/** Padding around the bounding box in world units */
	padding?: number;
	/** Minimum scale constraint (0 = no limit) */
	minScale?: number;
	/** Maximum scale constraint */
	maxScale?: number;
}

export interface AutoFitResult {
	/** Computed scale factor */
	scale: number;
	/** World-container X offset (canvas coords) */
	x: number;
	/** World-container Y offset (canvas coords) */
	y: number;
	/** Center X of bounding box (world coords) */
	cx: number;
	/** Center Y of bounding box (world coords) */
	cy: number;
}

/**
 * Compute the transform (scale, x, y) that fits all nodes within the canvas.
 * For large graphs where minScale would clip nodes, the minScale is relaxed
 * to ensure at least 80% of nodes are visible.
 */
export function computeAutoFitTransform(input: AutoFitInput): AutoFitResult | null {
	const { nodes, canvasW, canvasH } = input;
	if (nodes.length === 0 || canvasW <= 0 || canvasH <= 0) return null;

	const padding = input.padding ?? 80;
	const maxScale = input.maxScale ?? 1.5;
	const configMinScale = input.minScale ?? 0;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const n of nodes) {
		if (n.x - n.r < minX) minX = n.x - n.r;
		if (n.y - n.r < minY) minY = n.y - n.r;
		if (n.x + n.r > maxX) maxX = n.x + n.r;
		if (n.y + n.r > maxY) maxY = n.y + n.r;
	}

	const bw = maxX - minX + padding;
	const bh = maxY - minY + padding;
	if (bw <= 0 || bh <= 0) return null;

	// Natural scale to fit all nodes
	const naturalScale = Math.min(canvasW / bw, canvasH / bh, maxScale);

	// If minScale would cause clipping, relax it for large graphs
	let scale = naturalScale;
	if (configMinScale > 0 && naturalScale < configMinScale) {
		// Check what fraction of nodes would be visible at minScale
		const halfW = canvasW / (2 * configMinScale);
		const halfH = canvasH / (2 * configMinScale);
		const cx0 = (minX + maxX) / 2;
		const cy0 = (minY + maxY) / 2;
		let visibleCount = 0;
		for (const n of nodes) {
			if (Math.abs(n.x - cx0) <= halfW && Math.abs(n.y - cy0) <= halfH) visibleCount++;
		}
		const visibleFraction = visibleCount / nodes.length;
		// If less than 80% visible at minScale, use natural scale instead
		scale = visibleFraction < 0.8 ? naturalScale : configMinScale;
	}

	if (!isFinite(scale) || scale <= 0) return null;

	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	if (!isFinite(cx) || !isFinite(cy)) return null;

	return {
		scale,
		x: canvasW / 2 - cx * scale,
		y: canvasH / 2 - cy * scale,
		cx,
		cy,
	};
}

/**
 * Parse a groupBy expression string into individual field names.
 * Strips boolean operators (AND/OR/XOR/NOR/NAND/NOT) and ":?" suffix.
 * Returns empty array for falsy or "none" input.
 */
export function parseGroupByFields(groupBy: string | null | undefined): string[] {
	if (!groupBy || groupBy === "none") return [];
	const withoutOps = groupBy.replace(/\b(AND|OR|XOR|NOR|NAND|NOT)\b/gi, ",");
	return withoutOps
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((raw) => (raw.endsWith(":?") ? raw.slice(0, -2) : raw))
		.filter(Boolean);
}

/**
 * Given a set of node x-coordinates and a relative timeline range [min, max] ∈ [0,1],
 * return the set of node IDs that fall OUTSIDE the range.
 */
export function computeTimelineFilteredIds(
	allX: { id: string; x: number }[],
	visibleIds: { id: string; x: number }[],
	rangeMin: number,
	rangeMax: number,
): Set<string> {
	let globalMinX = Infinity,
		globalMaxX = -Infinity;
	for (const n of allX) {
		if (n.x < globalMinX) globalMinX = n.x;
		if (n.x > globalMaxX) globalMaxX = n.x;
	}
	const xSpan = globalMaxX - globalMinX;
	if (xSpan <= 0) return new Set();
	const tlMinX = globalMinX + xSpan * rangeMin;
	const tlMaxX = globalMinX + xSpan * rangeMax;
	const filtered = new Set<string>();
	for (const n of visibleIds) {
		if (n.x < tlMinX || n.x > tlMaxX) filtered.add(n.id);
	}
	return filtered;
}

// ---------------------------------------------------------------------------
// Compare Venn — exclusive/shared neighbor sets for compare nodes
// ---------------------------------------------------------------------------

/**
 * Compute Venn-like exclusive/shared neighbor sets for a list of compare nodes.
 * Returns null if fewer than 2 nodes are given.
 */
export function computeCompareVenn(
	compareNodeIds: readonly string[],
	adj: Map<string, Set<string>>,
): { exclusive: Map<string, Set<string>>; shared: Set<string> } | null {
	if (compareNodeIds.length < 2) return null;
	const neighborSets = new Map<string, Set<string>>();
	for (const nid of compareNodeIds) {
		const neighbors = new Set<string>();
		for (const nb of adj.get(nid) ?? []) {
			if (!compareNodeIds.includes(nb)) neighbors.add(nb);
		}
		neighborSets.set(nid, neighbors);
	}
	// Shared: neighbors in ALL selected nodes
	const allSets = [...neighborSets.values()];
	const shared = new Set<string>();
	if (allSets.length > 0) {
		for (const nb of allSets[0]) {
			if (allSets.every((s) => s.has(nb))) shared.add(nb);
		}
	}
	// Exclusive: neighbors unique to each node
	const exclusive = new Map<string, Set<string>>();
	for (const [nid, nbs] of neighborSets) {
		const exc = new Set<string>();
		for (const nb of nbs) {
			const othersHave = [...neighborSets.entries()].some(([k, s]) => k !== nid && s.has(nb));
			if (!othersHave) exc.add(nb);
		}
		exclusive.set(nid, exc);
	}
	return { exclusive, shared };
}

// ---------------------------------------------------------------------------
// Pathfinder — BFS shortest path + edge set construction
// ---------------------------------------------------------------------------

export interface PathfinderResult {
	path: string[];
	nodeSet: Set<string>;
	edgeSet: Set<string>;
}

/**
 * Find the shortest path between two nodes and build highlight sets.
 * Returns null if no path exists or inputs are invalid.
 */
export function computePathfinderResult(
	adj: Map<string, Set<string>>,
	startId: string | null,
	endId: string | null,
): PathfinderResult | null {
	if (!startId || !endId || startId === endId || !adj.size) return null;
	const path = bfsShortestPath(adj, startId, endId);
	if (path.length === 0) return null;
	const nodeSet = new Set(path);
	const edgeSet = new Set<string>();
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i],
			b = path[i + 1];
		edgeSet.add(`${a}→${b}`);
		edgeSet.add(`${b}→${a}`);
	}
	return { path, nodeSet, edgeSet };
}
