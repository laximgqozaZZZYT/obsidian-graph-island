/**
 * RenderHelpers — pure functions extracted from GraphViewContainer.
 * Contains color blending, frontmatter manipulation, preset summaries,
 * graph-rule derivation, and other side-effect-free helpers.
 */

import { parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { hexToRgb } from "../utils/color";
import type { ClusterGroupRule, GroupPreset, GraphEdge } from "../types";

// ---------------------------------------------------------------------------
// Cluster rule derivation
// ---------------------------------------------------------------------------

/**
 * Derive a single ClusterGroupRule from a query string + recursive flag.
 * Supports wildcard patterns like "tag:*" -> groupBy: "tag".
 */
export function deriveOneRule(queryText: string, recursive: boolean): ClusterGroupRule | null {
	if (!queryText.trim()) return null;
	const expr = parseQueryExpr(queryText.trim());
	if (!expr) return null;
	if (expr.type === "leaf" && expr.value === "*") {
		// Use field:? format (e.g. "tag:?", "category:?")
		return { groupBy: `${expr.field}:?`, recursive };
	}
	return { groupBy: `${expr.type === "leaf" ? expr.field : "tag"}:?`, recursive };
}

/** Derive ClusterGroupRule[] from multiple common queries (pipeline). */
export function deriveClusterRulesFromQueries(queries: { query: string; recursive: boolean }[]): ClusterGroupRule[] {
	const rules: ClusterGroupRule[] = [];
	for (const q of queries) {
		const rule = deriveOneRule(q.query, q.recursive);
		if (rule) rules.push(rule);
	}
	return rules;
}

export function deriveClusterRules(preset: GroupPreset): ClusterGroupRule[] {
	if (preset.commonQueries?.length) {
		return deriveClusterRulesFromQueries(preset.commonQueries);
	}
	// Legacy: single commonQuery field
	const cq = preset.commonQuery;
	if (!cq?.expression) return [];
	const queryText = serializeExpr(cq.expression);
	const rule = deriveOneRule(queryText, preset.recursive ?? false);
	return rule ? [rule] : [];
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Blend bg toward nodeColor at 15% -- used for label tinting. */
export function blendThemeLabel(bg: number, nodeColor: number): number {
	const r1 = (bg >> 16) & 0xff,
		g1 = (bg >> 8) & 0xff,
		b1 = bg & 0xff;
	const r2 = (nodeColor >> 16) & 0xff,
		g2 = (nodeColor >> 8) & 0xff,
		b2 = nodeColor & 0xff;
	return (
		(Math.round(r1 + (r2 - r1) * 0.15) << 16) |
		(Math.round(g1 + (g2 - g1) * 0.15) << 8) |
		Math.round(b1 + (b2 - b1) * 0.15)
	);
}

/** Lighten a hex color by a factor (0-1). factor=0.2 means 20% lighter. */
export function lightenHex(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	const lr = Math.min(255, r + Math.round(255 * factor));
	const lg = Math.min(255, g + Math.round(255 * factor));
	const lb = Math.min(255, b + Math.round(255 * factor));
	return (lr << 16) | (lg << 8) | lb;
}

/**
 * Heatmap color ramp: cold (blue 0x3b82f6) -> warm (red 0xef4444).
 * @param degree - node degree
 * @param maxDegree - maximum degree in the graph (for normalization)
 */
export function heatmapColor(degree: number, maxDegree: number): number {
	const t = Math.min(1, degree / Math.max(1, maxDegree));
	const r = Math.round(59 + t * (239 - 59)); // 0x3b -> 0xef
	const g = Math.round(130 - t * (130 - 68)); // 0x82 -> 0x44
	const b = Math.round(246 - t * (246 - 68)); // 0xf6 -> 0x44
	return (r << 16) | (g << 8) | b;
}

/** 20-color deterministic palette for community coloring (Tableau 20-inspired). */
export const COMMUNITY_PALETTE: readonly number[] = [
	0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf, 0xaec7e8,
	0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5, 0xc49c94, 0xf7b6d2, 0xc7c7c7, 0xdbdb8d, 0x9edae5,
];

/**
 * Resolve node color from a colorMap + node data.
 * Pure lookup: category -> tag fallback -> default.
 */
export function resolveNodeColor(
	node: { category?: string; tags?: string[] },
	colorMap: Map<string, string>,
	defaultColor: string,
): string {
	if (node.category) {
		const css = colorMap.get(node.category);
		if (css) return css;
	}
	if (node.tags && node.tags.length > 0) {
		const tagKey = `tag:${node.tags[0]}`;
		const css = colorMap.get(tagKey);
		if (css) return css;
	}
	return defaultColor;
}

// ---------------------------------------------------------------------------
// Arc / sunburst name cleaning
// ---------------------------------------------------------------------------

/** Clean sunburst arc name: strip redundant path prefix (e.g. "bible-apocrypha/bible-apocrypha" -> "bible-apocrypha") */
export function cleanArcName(name: string): string {
	if (!name.includes("/")) return name;
	const segments = name.split("/");
	if (segments.length >= 2 && segments[segments.length - 1] === segments[segments.length - 2]) {
		return segments[segments.length - 1];
	}
	return segments[segments.length - 1] || name;
}

// ---------------------------------------------------------------------------
// Position validation
// ---------------------------------------------------------------------------

/** Check if saved positions are within a reasonable coordinate range for force layout reuse. */
export function areSavedPositionsValid(
	positions: Map<string, { x: number; y: number }>,
	canvasW: number,
	canvasH: number,
): boolean {
	if (positions.size === 0) return false;
	const maxCoord = Math.max(canvasW, canvasH) * 5;
	for (const p of positions.values()) {
		if (!isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > maxCoord || Math.abs(p.y) > maxCoord) {
			return false;
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// Preset matching
// ---------------------------------------------------------------------------

/**
 * Find the first GroupPreset whose condition matches the current layout + tagDisplay.
 * Returns the matching preset or null.
 */
export function findMatchingGroupPreset(
	presets: GroupPreset[],
	currentLayout: string,
	tagDisplay: string,
): GroupPreset | null {
	for (const preset of presets) {
		const cond = preset.condition;
		if (cond.layout && cond.layout !== currentLayout) continue;
		if (cond.tagDisplay && cond.tagDisplay !== tagDisplay) continue;
		return preset;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Zoom threshold below which aggregate cluster summaries replace individual nodes */
export const AGGREGATE_ZOOM_THRESHOLD = 0.25;

/** All preset definitions -- single source of truth for applyPreset, applyPresetByKey, getPresetSummary */
export const ALL_PRESETS: Record<string, Record<string, unknown>> = {
	// Quick presets
	simple: {
		showLinks: true,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: false,
	},
	analysis: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: true,
		showSemanticEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSibling: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: true,
	},
	creative: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: false,
		showSemanticEdges: true,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		tagDisplay: "enclosure",
		showTagNodes: true,
	},
	"active-focus": {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 2,
		focusLayout: true,
		hoverHops: 1,
		showArrows: true,
		fadeEdgesByDegree: true,
	},
	"semantic-shapes": {
		nodeShapeRules: [
			{ match: "category" as const, category: "character", shape: "circle" as const },
			{ match: "category" as const, category: "place", shape: "hexagon" as const },
			{ match: "category" as const, category: "event", shape: "diamond" as const },
			{ match: "category" as const, category: "concept", shape: "triangle" as const },
			{ match: "default" as const, shape: "square" as const },
		],
	},
	"full-analysis": {
		showLinks: true,
		showTagEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showGraphStats: true,
		showBridgeNodes: true,
		showImportanceRing: true,
		nodeColorMode: "community",
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
	},
	// Thinking modes (M1)
	explore: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 3,
		focusLayout: true,
		focusConeEnabled: true,
		hoverHops: 2,
		showGapEdges: true,
		showSimilarSuggestions: true,
		fadeEdgesByDegree: true,
		showArrows: false,
		nodeColorMode: "category",
	},
	analyze: {
		syncWithEditor: false,
		localGraphCenter: null,
		showGraphStats: true,
		showBridgeNodes: true,
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
		nodeColorMode: "community",
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showOntologyBackbone: true,
		showHierarchyTree: true,
		directionalGravityRules: [{ filter: "type:inheritance", direction: "bottom", strength: 0.08 }],
	},
	write: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 1,
		focusLayout: true,
		presentationMode: true,
		hoverHops: 1,
		showArrows: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		nodeSize: 25,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showSimilar: false,
		focusConeEnabled: true,
	},
};

// ---------------------------------------------------------------------------
// Frontmatter helpers (pure string transforms)
// ---------------------------------------------------------------------------

/** Set a frontmatter field (creates YAML block if needed). */
export function setFrontmatterField(content: string, key: string, value: string): string {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const fmBody = fmMatch[1];
		const regex = new RegExp(`^${key}:.*$`, "m");
		if (regex.test(fmBody)) {
			const newFm = fmBody.replace(regex, `${key}: ${value}`);
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else {
			const newFm = fmBody + `\n${key}: ${value}`;
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		}
	} else {
		return `---\n${key}: ${value}\n---\n${content}`;
	}
}

/** Add a tag to frontmatter tags array. */
export function addFrontmatterTag(content: string, tag: string): string {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const fmBody = fmMatch[1];
		const tagsRegex = /^tags:\s*\[([^\]]*)\]/m;
		const tagsListRegex = /^tags:\s*$/m;
		if (tagsRegex.test(fmBody)) {
			const newFm = fmBody.replace(tagsRegex, (match, inner) => {
				const existing = inner ? inner + ", " : "";
				return `tags: [${existing}${tag}]`;
			});
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else if (tagsListRegex.test(fmBody)) {
			const newFm = fmBody.replace(tagsListRegex, `tags:\n  - ${tag}`);
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else {
			const newFm = fmBody + `\ntags: [${tag}]`;
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		}
	} else {
		return `---\ntags: [${tag}]\n---\n${content}`;
	}
}

// ---------------------------------------------------------------------------
// Edge analysis helpers
// ---------------------------------------------------------------------------

/** Count edges by type. Pure function over edge array. */
export function countEdgeTypes(edges: GraphEdge[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const e of edges) {
		const t = e.type || "link";
		counts[t] = (counts[t] || 0) + 1;
	}
	return counts;
}

// ---------------------------------------------------------------------------
// Preset summary
// ---------------------------------------------------------------------------

/** Get human-readable summary of a preset's settings for tooltip preview. */
export function getPresetSummary(key: string): string {
	const presetDefs: Record<string, Record<string, unknown>> = {
		simple: { edges: "links only", arrows: false, color: "category" },
		analysis: { edges: "all types", arrows: true, color: "category", fade: true },
		creative: { edges: "links+tags+semantic", tags: "enclosure", color: "category" },
		"active-focus": { mode: "local graph", hops: 2, focus: true, arrows: true },
		"full-analysis": { edges: "all types", arrows: true, stats: true, color: "community", bridges: true },
		explore: { mode: "local graph", hops: 3, focus: true, similar: true },
		analyze: { stats: true, bridges: true, entropy: true, color: "community", arrows: true },
		write: { mode: "local graph", hops: 1, focus: true, presentation: true },
	};
	const def = presetDefs[key];
	if (!def) return "";
	return Object.entries(def)
		.map(([k, v]) => `${k}: ${v}`)
		.join("\n");
}

// ---------------------------------------------------------------------------
// Hover tooltip text builder
// ---------------------------------------------------------------------------

/** Options for building hover tooltip text. */
export interface TooltipTextOptions {
	label: string;
	showTitle: boolean;
	showTooltip: boolean;
	showMeta: boolean;
	showBody: boolean;
	isKeyboardFocused: boolean;
	showSimilarSuggestions: boolean;
	tags?: string[];
	category?: string;
	hoverTooltipFields?: string;
	degree: number;
	collapsedMembers?: string[];
	bodyPreview?: string;
	isEnclosure: boolean;
	hasVisibleTagLabel: boolean;
	edgeTypeSummary: Map<string, number>;
	similarNodes: { label: string; score: number }[];
	/** Callback to resolve a custom field value by name. */
	getFieldValue?: (field: string) => string | undefined;
}

/**
 * Build the metadata section of a tooltip: tags, category, custom fields,
 * degree, collapsed-member count, and edge-type summary.
 */
export function buildTooltipMetadata(opts: TooltipTextOptions): string {
	let meta = "";
	if (opts.tags && opts.tags.length > 0 && !opts.hasVisibleTagLabel && !opts.isEnclosure) {
		meta += "\n" + opts.tags.map((t: string) => `#${t}`).join(" ");
	}
	if (opts.category) {
		meta += "\n[" + opts.category + "]";
	}
	if (opts.hoverTooltipFields) {
		const fields = opts.hoverTooltipFields
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const field of fields) {
			const val = opts.getFieldValue?.(field);
			if (val !== undefined && val !== "") {
				meta += `\n${field}: ${val}`;
			}
		}
	}
	meta += `\n\u00B0 ${opts.degree}`;
	if (opts.collapsedMembers && opts.collapsedMembers.length > 0) {
		meta += `\n${opts.collapsedMembers.length} members`;
	}
	if (opts.edgeTypeSummary.size > 0) {
		meta += `\n${[...opts.edgeTypeSummary.entries()].map(([t, c]) => `${t}:${c}`).join(" ")}`;
	}
	return meta;
}

/**
 * Assemble hover tooltip text from node data (pure function).
 * Returns empty string when no content should be displayed.
 */
export function buildHoverTooltipText(opts: TooltipTextOptions): string {
	let text = "";

	if (opts.showTitle) {
		text = opts.label;
	}

	if (opts.showTooltip && opts.showMeta) {
		text += buildTooltipMetadata(opts);
	}

	if (opts.showTooltip && opts.showBody && opts.bodyPreview) {
		text += "\n---\n" + opts.bodyPreview;
	}

	if (opts.showTooltip && opts.isKeyboardFocused) {
		text += "\n\u2500 Enter: open \u00B7 Shift+Enter: select \u00B7 Ctrl+Enter: compare";
	}

	if (opts.showSimilarSuggestions && opts.similarNodes.length > 0) {
		text += "\n\u2014 Similar \u2014";
		for (const s of opts.similarNodes) {
			text += `\n  ${s.label} (${(s.score * 100).toFixed(0)}%)`;
		}
	}

	return text;
}

// ---------------------------------------------------------------------------
// Viewport scale factor (quadratic solve)
// ---------------------------------------------------------------------------

/**
 * Compute the uniform scale factor via quadratic equation so that
 * scaled positions + constant radii meet the minUtil threshold exactly.
 */
export function computeViewportScaleFactor(
	bboxW: number,
	bboxH: number,
	minUtil: number,
	vpArea: number,
	util: number,
	avgR: number,
): number {
	const posSpanW = Math.max(bboxW - 2 * avgR, 1);
	const posSpanH = Math.max(bboxH - 2 * avgR, 1);
	const A = posSpanW * posSpanH;
	const B = 2 * avgR * (posSpanW + posSpanH);
	const C = 4 * avgR * avgR - minUtil * vpArea;
	const disc = B * B - 4 * A * C;
	return disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.sqrt(minUtil / util); // fallback
}

/**
 * Compute average radius from an iterable of values.
 * Falls back to 12 when a value is falsy.
 */
export function computeAvgRadius(radii: Iterable<number>, count: number): number {
	if (count === 0) return 12;
	let sum = 0;
	for (const r of radii) sum += r || 12;
	return sum / count;
}

/**
 * Compute the spread target for a degenerate axis.
 * Returns { axis: 'x'|'y', targetSpan } or null if not degenerate.
 */
export function computeDegenerateSpread(
	bboxW: number,
	bboxH: number,
	degenerateThreshold: number,
	minUtil: number,
	vpArea: number,
): { axis: "x" | "y"; targetSpan: number } | null {
	if (bboxW > degenerateThreshold && bboxH < degenerateThreshold) {
		return { axis: "y", targetSpan: Math.max(bboxW * 0.3, (minUtil * vpArea) / bboxW) };
	}
	if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
		return { axis: "x", targetSpan: Math.max(bboxH * 0.3, (minUtil * vpArea) / bboxH) };
	}
	return null;
}

// ---------------------------------------------------------------------------
// Phantom node generation (road network routing junctions)
// ---------------------------------------------------------------------------

/**
 * Generate phantom routing junction nodes arranged in a grid or polar pattern.
 * These invisible nodes provide anchor points for the road-network edge routing.
 */
export function generatePhantomNodes(
	realNodes: { x: number; y: number; isPhantom?: boolean }[],
	cx: number,
	cy: number,
	isPolar: boolean,
): { id: string; label: string; x: number; y: number; vx: number; vy: number; isPhantom: true }[] {
	const phantoms: { id: string; label: string; x: number; y: number; vx: number; vy: number; isPhantom: true }[] = [];

	if (isPolar) {
		const spokeCount = Math.min(12, Math.max(8, Math.ceil(Math.sqrt(realNodes.length / 5))));
		const ringCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(realNodes.length / 10))));
		let maxR = 0;
		for (const n of realNodes) {
			if (n.isPhantom) continue;
			const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
			if (d > maxR) maxR = d;
		}
		if (maxR < 10) maxR = 500;

		for (let ri = 1; ri <= ringCount; ri++) {
			const r = (maxR * ri) / (ringCount + 1);
			for (let si = 0; si < spokeCount; si++) {
				const theta = (si / spokeCount) * Math.PI * 2;
				phantoms.push({
					id: `__phantom_r${ri}_s${si}`,
					label: "",
					x: cx + r * Math.cos(theta),
					y: cy + r * Math.sin(theta),
					vx: 0,
					vy: 0,
					isPhantom: true,
				});
			}
		}
	} else {
		const gridSize = Math.min(10, Math.max(6, Math.ceil(Math.sqrt(realNodes.length / 8))));
		let xMin = Infinity,
			xMax = -Infinity,
			yMin = Infinity,
			yMax = -Infinity;
		for (const n of realNodes) {
			if (n.isPhantom) continue;
			if (n.x < xMin) xMin = n.x;
			if (n.x > xMax) xMax = n.x;
			if (n.y < yMin) yMin = n.y;
			if (n.y > yMax) yMax = n.y;
		}
		if (xMin === Infinity) {
			xMin = cx - 250;
			xMax = cx + 250;
			yMin = cy - 250;
			yMax = cy + 250;
		}
		const w = xMax - xMin || 500;
		const h = yMax - yMin || 500;

		for (let xi = 0; xi <= gridSize; xi++) {
			for (let yi = 0; yi <= gridSize; yi++) {
				phantoms.push({
					id: `__phantom_x${xi}_y${yi}`,
					label: "",
					x: xMin + (w * xi) / gridSize,
					y: yMin + (h * yi) / gridSize,
					vx: 0,
					vy: 0,
					isPhantom: true,
				});
			}
		}
	}

	return phantoms;
}

// ---------------------------------------------------------------------------
// Analysis overlay flag mapping
// ---------------------------------------------------------------------------

interface AnalysisOverlayFlags {
	showBridgeNodes: boolean;
	showEntropyOverlay: boolean;
	highlightMissingNeighbors: boolean;
	showGapEdges: boolean;
	showDensityHeatmap: boolean;
}

/** Map an analysis overlay mode string to individual boolean flags. */
export function resolveAnalysisOverlay(mode: string): AnalysisOverlayFlags {
	return {
		showBridgeNodes: mode === "bridges" || mode === "all",
		showEntropyOverlay: mode === "entropy" || mode === "all",
		highlightMissingNeighbors: mode === "missing" || mode === "all",
		showGapEdges: mode === "gaps" || mode === "all",
		showDensityHeatmap: mode === "density" || mode === "all",
	};
}

// ---------------------------------------------------------------------------
// Image meta detection
// ---------------------------------------------------------------------------

/** Check if any node data items have image/thumbnail/cover frontmatter metadata. */
export function hasImageMetaNodes(nodes: Iterable<{ meta?: Record<string, unknown> }>): boolean {
	for (const data of nodes) {
		const m = data?.meta;
		if (m && (m.image || m.thumbnail || m.cover)) return true;
	}
	return false;
}
