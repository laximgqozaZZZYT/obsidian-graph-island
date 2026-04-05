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

/**
 * Resolve the display color for a single node.
 * Returns a numeric hex color (e.g. 0xff0000).
 */
export function computeNodeDisplayColor(
	node: GraphNode,
	ctx: NodeColorContext,
	defaultColor: number,
): number {
	// Manual group overrides take priority
	for (const grp of ctx.groups) {
		if (grp.expression && evaluateExpr(grp.expression, node)) {
			return cssColorToHex(grp.color);
		}
	}

	if (ctx.colorMode === "category") {
		if (node.category) {
			return cssColorToHex(ctx.colorMap.get(node.category) || DEFAULT_COLORS[0]);
		}
		if (node.tags && node.tags.length > 0) {
			return cssColorToHex(ctx.colorMap.get(`tag:${node.tags[0]}`) || DEFAULT_COLORS[0]);
		}
	}

	if (ctx.colorMode === "field" && ctx.colorField) {
		const fieldVal = ctx.getNodeProperty(node.id, ctx.colorField);
		if (fieldVal !== undefined && fieldVal !== "") {
			const key = String(fieldVal);
			if (!ctx.colorMap.has(key)) {
				const customPalette = ctx.customColorPalette
					? ctx.customColorPalette
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean)
					: [];
				const palette = customPalette.length > 0 ? customPalette : (DEFAULT_COLORS as unknown as string[]);
				const idx = ctx.colorMap.size % palette.length;
				ctx.colorMap.set(key, palette[idx]);
			}
			return cssColorToHex(ctx.colorMap.get(key)!);
		}
	}

	if (ctx.colorMode === "community" && ctx.communityMap) {
		const cid = ctx.communityMap.get(node.id) ?? 0;
		return COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length];
	}

	return defaultColor;
}
