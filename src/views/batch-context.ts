/**
 * Pure(-ish) helpers extracted from RenderPipeline._buildBatchContext
 * to reduce cyclomatic complexity of the God Object.
 */
import type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// Viewport bounds
// ---------------------------------------------------------------------------

interface ViewportBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * Compute the world-coordinate viewport rectangle with a margin buffer.
 * Used for frustum-culling nodes outside the visible area.
 */
export function computeViewportBounds(
	worldX: number,
	worldY: number,
	worldScale: number,
	canvasW: number,
	canvasH: number,
	marginPx: number,
): ViewportBounds {
	const margin = marginPx / worldScale;
	const minX = -worldX / worldScale - margin;
	const minY = -worldY / worldScale - margin;
	return {
		minX,
		minY,
		maxX: minX + canvasW / worldScale + margin * 2,
		maxY: minY + canvasH / worldScale + margin * 2,
	};
}

// ---------------------------------------------------------------------------
// Visible-node collection
// ---------------------------------------------------------------------------

interface VisibleNodeFilter {
	hiddenBySearch: Set<string>;
	hasHighlight: boolean;
	activeSet: Set<string>;
	aggregateMode: boolean;
	screenshotMode: boolean;
	viewport: ViewportBounds;
}

/**
 * Collect nodes that should be rendered this frame.
 *
 * Side-effect: sets `pn.gfx.visible` on every node (true/false).
 * Returns only the nodes that passed all visibility checks.
 */
export function collectVisibleNodes(
	pixiNodes: Map<string, PixiNode>,
	out: PixiNode[],
	filter: VisibleNodeFilter,
): void {
	out.length = 0;
	const { hiddenBySearch, hasHighlight, activeSet, aggregateMode, screenshotMode, viewport } = filter;

	for (const pn of pixiNodes.values()) {
		if (hiddenBySearch.has(pn.data.id)) continue;
		if (hasHighlight && activeSet.has(pn.data.id)) continue;

		const nx = pn.data.x;
		const ny = pn.data.y;
		if (nx < viewport.minX || nx > viewport.maxX || ny < viewport.minY || ny > viewport.maxY) {
			pn.gfx.visible = false;
			continue;
		}

		if (aggregateMode && !screenshotMode && !(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0)) {
			pn.gfx.visible = false;
			continue;
		}

		pn.gfx.visible = true;
		out.push(pn);
	}
}
