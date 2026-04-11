/**
 * Pure-function node color resolution extracted from GraphViewContainer.recolorNodes.
 * Resolves the display color for a single graph node based on group rules, color mode,
 * and community detection — without any DOM or Obsidian API dependency.
 */

import { cssColorToHex } from "../utils/graph-helpers";
import { DEFAULT_COLORS, type GroupRule } from "../types";
import { evaluateExpr } from "../utils/query-expr";
import type { GraphNode } from "../types";

/** D3-category-20 palette for community coloring. */
export const COMMUNITY_PALETTE: readonly number[] = [
	0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf,
	0xaec7e8, 0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5, 0xc49c94, 0xf7b6d2, 0xc7c7c7, 0xdbdb8d, 0x9edae5,
];

interface NodeColorContext {
	groups: GroupRule[];
	colorMode: string;
	colorField?: string;
	customColorPalette?: string;
	colorMap: Map<string, string>;
	communityMap: Map<string, number> | null;
	getNodeProperty: (nodeId: string, field: string) => string | undefined;
}

function resolveGroupColor(node: GraphNode, groups: GroupRule[]): number | null {
	for (const grp of groups) {
		if (grp.expression && evaluateExpr(grp.expression, node)) {
			return cssColorToHex(grp.color);
		}
	}
	return null;
}

function resolveCategoryColor(node: GraphNode, colorMap: Map<string, string>): number | null {
	if (node.category) {
		return cssColorToHex(colorMap.get(node.category) || DEFAULT_COLORS[0]);
	}
	if (node.tags && node.tags.length > 0) {
		return cssColorToHex(colorMap.get(`tag:${node.tags[0]}`) || DEFAULT_COLORS[0]);
	}
	return null;
}

function resolveFieldColor(node: GraphNode, ctx: NodeColorContext): number | null {
	if (!ctx.colorField) return null;
	const fieldVal = ctx.getNodeProperty(node.id, ctx.colorField);
	if (fieldVal === undefined || fieldVal === "") return null;

	const key = String(fieldVal);
	if (!ctx.colorMap.has(key)) {
		const customPalette = ctx.customColorPalette
			? ctx.customColorPalette
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
		const palette = customPalette.length > 0 ? customPalette : (DEFAULT_COLORS as unknown as string[]);
		ctx.colorMap.set(key, palette[ctx.colorMap.size % palette.length]);
	}
	return cssColorToHex(ctx.colorMap.get(key)!);
}

function resolveCommunityColor(nodeId: string, communityMap: Map<string, number> | null): number | null {
	if (!communityMap) return null;
	const cid = communityMap.get(nodeId) ?? 0;
	return COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length];
}

/**
 * Resolve the display color for a single node.
 * Returns a numeric hex color (e.g. 0xff0000).
 */
export function computeNodeDisplayColor(
	node: GraphNode,
	ctx: NodeColorContext,
	defaultColor: number,
): number {
	const groupHit = resolveGroupColor(node, ctx.groups);
	if (groupHit != null) return groupHit;

	if (ctx.colorMode === "category") return resolveCategoryColor(node, ctx.colorMap) ?? defaultColor;
	if (ctx.colorMode === "field") return resolveFieldColor(node, ctx) ?? defaultColor;
	if (ctx.colorMode === "community") return resolveCommunityColor(node.id, ctx.communityMap) ?? defaultColor;

	return defaultColor;
}
