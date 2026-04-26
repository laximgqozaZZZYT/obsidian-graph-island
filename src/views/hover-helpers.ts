/**
 * Pure helper functions for hover tooltip and off-screen link tooltip logic.
 * Extracted from GraphViewContainer to reduce complexity.
 */
import type { ClusterArrangement, GraphEdge, GraphNode } from "../types";
import { edgeTypeSummary, collapsedGroupSummary } from "../utils/graph-helpers";
import { computeSimilarNodes, type SimilarNode } from "../analysis/graph-analysis";

// ---------------------------------------------------------------------------
// Hover tooltip text building
// ---------------------------------------------------------------------------

export interface HoverTooltipInput {
	label: string;
	tags?: string[];
	category?: string;
	collapsedMembers?: string[];
	bodyPreview?: string;
	id: string;
}

export interface HoverTooltipOptions {
	showTitle: boolean;
	showMeta: boolean;
	showBody: boolean;
	showTooltip: boolean;
	isKeyboardFocused: boolean;
	showSimilarSuggestions: boolean;
	tagDisplayEnclosure: boolean;
	hasVisibleTagLabel: boolean;
	tooltipFields?: string;
	degree: number;
	graphEdges: GraphEdge[];
	getNodeProperty: (id: string, field: string) => unknown;
	similarCache: Map<string, SimilarNode[]>;
	allNodes: GraphNode[];
}

/** Build the text content for a hover tooltip. Returns empty string if all content is disabled. */
export function buildHoverTooltipText(node: HoverTooltipInput, opts: HoverTooltipOptions): string {
	let tooltipText = "";

	// Title
	if (opts.showTitle) {
		tooltipText = node.label;
	}

	// Metadata
	if (opts.showTooltip && opts.showMeta) {
		tooltipText = appendMetadata(tooltipText, node, opts);
	}

	// Body preview
	if (opts.showTooltip && opts.showBody && node.bodyPreview) {
		tooltipText += "\n---\n" + node.bodyPreview;
	}

	// Keyboard shortcuts
	if (opts.showTooltip && opts.isKeyboardFocused) {
		tooltipText += "\n─ Enter: open · Shift+Enter: select · Ctrl+Enter: compare";
	}

	// Similar suggestions
	if (opts.showSimilarSuggestions) {
		tooltipText = appendSimilarSuggestions(tooltipText, node.id, opts);
	}

	return tooltipText;
}

function appendMetadata(text: string, node: HoverTooltipInput, opts: HoverTooltipOptions): string {
	if (node.tags && node.tags.length > 0 && !opts.hasVisibleTagLabel && !opts.tagDisplayEnclosure) {
		text += "\n" + node.tags.map((t: string) => `#${t}`).join(" ");
	}
	if (node.category) {
		text += "\n[" + node.category + "]";
	}
	if (opts.tooltipFields) {
		const fields = opts.tooltipFields
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const field of fields) {
			const val = opts.getNodeProperty(node.id, field);
			if (val !== undefined && val !== "") {
				text += `\n${field}: ${val}`;
			}
		}
	}
	text += `\n° ${opts.degree}`;

	// DQ: Collapsed group node summary
	if (node.collapsedMembers && node.collapsedMembers.length > 0) {
		text += "\n" + collapsedGroupSummary(node.collapsedMembers);
	}

	// EK: Edge type summary
	if (opts.graphEdges) {
		const edgeTypes = edgeTypeSummary(opts.graphEdges, node.id);
		if (edgeTypes.size > 0) {
			text += `\n${[...edgeTypes.entries()].map(([t, c]) => `${t}:${c}`).join(" ")}`;
		}
	}

	return text;
}

function appendSimilarSuggestions(text: string, nodeId: string, opts: HoverTooltipOptions): string {
	let similar = opts.similarCache.get(nodeId);
	if (!similar) {
		similar = computeSimilarNodes(nodeId, opts.allNodes, opts.graphEdges, 3, 0.15);
		opts.similarCache.set(nodeId, similar);
	}
	if (similar.length > 0) {
		text += "\n— Similar —";
		for (const s of similar) {
			text += `\n  ${s.label} (${(s.score * 100).toFixed(0)}%)`;
		}
	}
	return text;
}

// ---------------------------------------------------------------------------
// Off-screen link tooltips: neighbor grouping
// ---------------------------------------------------------------------------

interface OffScreenNodeInfo {
	id: string;
	gfxX: number;
	gfxY: number;
	filePath?: string;
	label?: string;
}

/** Group off-screen neighbors by cluster key, computing running average screen positions. */
export function groupOffScreenNeighbors(
	neighbors: string[],
	getNode: (id: string) => OffScreenNodeInfo | null,
	ws: number,
	worldX: number,
	worldY: number,
	canvasW: number,
	canvasH: number,
	margin: number,
	getClusterKey: (id: string, folder: string) => string,
): Map<string, { names: string[]; avgSx: number; avgSy: number }> {
	const dirGroups = new Map<string, { names: string[]; avgSx: number; avgSy: number }>();
	for (const nbId of neighbors) {
		const nb = getNode(nbId);
		if (!nb) continue;
		const sx = nb.gfxX * ws + worldX;
		const sy = nb.gfxY * ws + worldY;
		// Is off-screen?
		if (sx >= margin && sx <= canvasW - margin && sy >= margin && sy <= canvasH - margin) continue;
		const path = nb.filePath ?? "";
		const folder = path.split("/")[0] || "other";
		const clusterKey = getClusterKey(nbId, folder);
		const label = nb.label || nbId.replace(/\.md$/, "").split("/").pop() || nbId;
		if (!dirGroups.has(clusterKey)) {
			dirGroups.set(clusterKey, { names: [], avgSx: 0, avgSy: 0 });
		}
		const grp = dirGroups.get(clusterKey)!;
		grp.names.push(label);
		const n = grp.names.length;
		grp.avgSx += (sx - grp.avgSx) / n;
		grp.avgSy += (sy - grp.avgSy) / n;
	}
	return dirGroups;
}

/** Compute the position on the canvas edge for a tooltip pointing from hovSx,hovSy toward avgSx,avgSy. */
export function computeTooltipEdgePosition(
	hovSx: number,
	hovSy: number,
	avgSx: number,
	avgSy: number,
	canvasW: number,
	canvasH: number,
	margin: number,
): { tipX: number; tipY: number } {
	const dx = avgSx - hovSx;
	const dy = avgSy - hovSy;
	const dist = Math.sqrt(dx * dx + dy * dy) || 1;
	const nx = dx / dist;
	const ny = dy / dist;

	const tMax = 10000;
	let t = tMax;
	if (nx > 0.01) t = Math.min(t, (canvasW - margin - hovSx) / nx);
	else if (nx < -0.01) t = Math.min(t, (margin - hovSx) / nx);
	if (ny > 0.01) t = Math.min(t, (canvasH - margin - hovSy) / ny);
	else if (ny < -0.01) t = Math.min(t, (margin - hovSy) / ny);
	t = Math.max(40, t);
	const tipX = Math.max(margin, Math.min(canvasW - margin, hovSx + nx * t));
	const tipY = Math.max(margin, Math.min(canvasH - margin, hovSy + ny * t));
	return { tipX, tipY };
}

// ---------------------------------------------------------------------------
// Hover highlight set: shared-tags and same-folder helpers
// ---------------------------------------------------------------------------

interface HoverHighlightNode {
	id: string;
	tags?: string[];
	filePath?: string;
}

/** Find nodes sharing at least one tag with the hovered node. */
export function findSharedTagNodes(
	hoveredTags: string[],
	hoveredId: string,
	nodes: Iterable<HoverHighlightNode>,
): string[] {
	const hovSet = new Set(hoveredTags);
	const result: string[] = [];
	for (const n of nodes) {
		if (n.id === hoveredId) continue;
		if (n.tags?.some((t) => hovSet.has(t))) result.push(n.id);
	}
	return result;
}

/** Find nodes in the same top-level folder. */
export function findSameFolderNodes(
	hoveredFilePath: string,
	hoveredId: string,
	nodes: Iterable<HoverHighlightNode>,
): string[] {
	const hoveredFolder = hoveredFilePath.split("/")[0];
	if (!hoveredFolder) return [];
	const result: string[] = [];
	for (const n of nodes) {
		if (n.filePath?.split("/")[0] === hoveredFolder) result.push(n.id);
	}
	return result;
}

// ---------------------------------------------------------------------------
// doRender helpers
// ---------------------------------------------------------------------------

/** Resolve "inherit" clusterArrangement to a concrete arrangement. */
export function resolveInheritArrangement(clusterGroupArrangement: string | undefined): ClusterArrangement {
	const gga = clusterGroupArrangement ?? "auto";
	if (gga === "circle" || gga === "concentric") return "concentric";
	if (gga === "grid" || gga === "horizontal" || gga === "vertical") return "grid";
	return "grid";
}

/** Clear all canvas layers for non-graph viewModes. */
export function clearNonGraphLayers(
	viewMode: string,
	layers: {
		edgeGraphics?: { clear(): void } | null;
		orbitGraphics?: { clear(): void } | null;
		enclosureGraphics?: { clear(): void } | null;
		arrowGraphics?: { clear(): void } | null;
		trayGraphics?: { clear(): void } | null;
		linkPreviewGfx?: { clear(): void } | null;
		pathfinderGraphics?: { clear(): void } | null;
		nodeCircleBatch?: { clear(): void } | null;
		sunburstGraphics?: { clear(): void } | null;
		barGraphics?: { clear(): void } | null;
		routeGraphics?: { clear(): void } | null;
		guideGraphics?: { clear(): void } | null;
	},
): void {
	const clearLayers: ({ clear(): void } | null | undefined)[] = [
		layers.edgeGraphics,
		layers.orbitGraphics,
		layers.enclosureGraphics,
		layers.arrowGraphics,
		layers.trayGraphics,
		layers.linkPreviewGfx,
		layers.pathfinderGraphics,
		layers.nodeCircleBatch,
	];
	if (viewMode !== "sunburst") clearLayers.push(layers.sunburstGraphics);
	if (viewMode !== "timeline") {
		clearLayers.push(layers.barGraphics, layers.routeGraphics, layers.guideGraphics);
	}
	for (const gfx of clearLayers) {
		if (gfx) gfx.clear();
	}
}

// ---------------------------------------------------------------------------
// autoFitView helpers
// ---------------------------------------------------------------------------

/** Compute the card-mode bounding box, replacing minX/minY/maxX/maxY with card extents. */
export function computeCardBBox(
	nodes: Iterable<{ x: number; y: number; radius: number }>,
	sc0: number,
	cardAR: number,
	crc: { tableHeaderHeight: number; fieldLineHeight: number; cardPadding: number },
	numFields: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
	const hH = crc.tableHeaderHeight / sc0;
	const fLH = crc.fieldLineHeight / sc0;
	const padW = crc.cardPadding / sc0;
	const totalH = hH + numFields * fLH + padW * 2;
	const cardHalfW = (totalH * cardAR) / 2;
	const cardHalfH = totalH / 2;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const pn of nodes) {
		if (pn.x - cardHalfW < minX) minX = pn.x - cardHalfW;
		if (pn.y - cardHalfH < minY) minY = pn.y - cardHalfH;
		if (pn.x + cardHalfW > maxX) maxX = pn.x + cardHalfW;
		if (pn.y + cardHalfH > maxY) maxY = pn.y + cardHalfH;
	}
	return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// _finalizeStaticLayout helpers
// ---------------------------------------------------------------------------

/** Build transition data from saved positions vs. new layout positions. */
export function buildTransitionData(
	nodes: Iterable<{ data: { id: string; x: number; y: number } }>,
	savedPositions: Map<string, { x: number; y: number }>,
): { data: { x: number; y: number }; fromX: number; fromY: number; toX: number; toY: number }[] {
	const transitionData: {
		data: { x: number; y: number };
		fromX: number;
		fromY: number;
		toX: number;
		toY: number;
	}[] = [];
	for (const pn of nodes) {
		const saved = savedPositions.get(pn.data.id);
		if (saved && (Math.abs(saved.x - pn.data.x) > 1 || Math.abs(saved.y - pn.data.y) > 1)) {
			transitionData.push({
				data: pn.data,
				fromX: saved.x,
				fromY: saved.y,
				toX: pn.data.x,
				toY: pn.data.y,
			});
		}
	}
	return transitionData;
}

/** Compute timeline viewport fit from bar data. */
export function computeTimelineFit(
	bars: { xStart: number; xEnd: number; yCenter: number; barHeight: number }[],
	W: number,
	H: number,
): { scale: number; cx: number; cy: number } | null {
	if (!bars.length) return null;
	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;
	for (const b of bars) {
		if (b.xStart < minX) minX = b.xStart;
		if (b.xEnd > maxX) maxX = b.xEnd;
		if (b.yCenter - b.barHeight / 2 < minY) minY = b.yCenter - b.barHeight / 2;
		if (b.yCenter + b.barHeight / 2 > maxY) maxY = b.yCenter + b.barHeight / 2;
	}
	const marginX = (maxX - minX) * 0.1;
	const marginY = (maxY - minY) * 0.1;
	const bw = maxX - minX + marginX * 2;
	const bh = maxY - minY + marginY * 2;
	const scale = Math.min(W / bw, H / bh, 2);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return { scale, cx, cy };
}
