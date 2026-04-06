/**
 * Donut and sunburst-segment rendering functions extracted from RenderPipeline.
 * Handles donut ring, sector-breakdown, and sunburst-segment display modes.
 */
import type { CanvasGraphics } from "./canvas2d";
import type { DonutDisplayConfig } from "../types";
import type { PixiNode } from "./InteractionManager";
import { darkenColor } from "./render-pipeline-utils";
import { incCounter } from "../utils/graph-helpers";
import type { RenderHost } from "./RenderPipeline";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Donut/sunburst ring stroke darken factor (applied via darkenColor) */
export const RING_STROKE_DARKEN = 0.4;
/** Donut/sunburst ring stroke alpha multiplier */
export const RING_STROKE_ALPHA = 0.5;
/** Sunburst segment default arc angle in degrees */
export const SUNBURST_SEGMENT_ARC_DEG = 30;

// ---------------------------------------------------------------------------
// Shared context interface
// ---------------------------------------------------------------------------

/** Rendering context shared by donut/sunburst functions. */
export interface DonutRenderCtx {
	visible: PixiNode[];
	tlFilteredOut: Set<string> | null;
	alpha: number;
	minWorldRadius: number;
}

// ---------------------------------------------------------------------------
// Donut mode
// ---------------------------------------------------------------------------

/** Render donut rings for all visible nodes. */
export function renderDonutMode(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: DonutRenderCtx,
	crc: { filteredNodeAlpha: number },
): void {
	const { visible, tlFilteredOut, alpha, minWorldRadius } = ctx;
	const donutConfig = host.getDonutDisplayConfig();
	const innerR = donutConfig.innerRadius ?? 0.6;
	const bgColor = host.isDarkTheme() ? 0x1e1e1e : 0xffffff;

	for (const pn of visible) {
		const effR = Math.max(pn.radius, minWorldRadius);
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;

		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		if (isSuperNode && donutConfig.breakdownField) {
			renderDonutBreakdown(
				host,
				g,
				pn,
				effR,
				nodeAlpha,
				innerR,
				bgColor,
				donutConfig.breakdownField,
			);
		} else {
			// Single-color ring for individual nodes
			const strokeColor = darkenColor(pn.color, RING_STROKE_DARKEN);
			g.lineStyle(1, strokeColor, nodeAlpha * RING_STROKE_ALPHA);
			g.beginFill(pn.color, nodeAlpha);
			g.drawCircle(pn.data.x, pn.data.y, effR);
			g.endFill();
			// Inner cutout
			g.lineStyle(0);
			g.beginFill(bgColor, 1);
			g.drawCircle(pn.data.x, pn.data.y, effR * innerR);
			g.endFill();
		}
	}
}

// ---------------------------------------------------------------------------
// Donut breakdown (sector chart for super nodes)
// ---------------------------------------------------------------------------

/** Draw sector breakdown donut for a super node. */
export function renderDonutBreakdown(
	host: RenderHost,
	g: CanvasGraphics,
	pn: PixiNode,
	effR: number,
	nodeAlpha: number,
	innerR: number,
	bgColor: number,
	breakdownField: string,
): void {
	const members = pn.data.collapsedMembers!;
	const valueCounts = new Map<string, number>();
	for (const memberId of members) {
		const memberPn = host.getPixiNodes().get(memberId);
		const val = (memberPn?.data?.meta?.[breakdownField] as string) ?? "other";
		incCounter(valueCounts, val);
	}

	let startAngle = -Math.PI / 2;
	const total = members.length;
	let colorIdx = 0;
	const sectorColors = host.getRenderThresholds?.()?.donutSectorColors ?? [
		0x818cf8, 0xf472b6, 0xfbbf24, 0x34d399, 0x60a5fa, 0xf87171, 0xb4a0ff, 0x2dd4bf,
	];
	g.lineStyle(0);
	for (const [, count] of valueCounts) {
		const sliceAngle = (count / total) * Math.PI * 2;
		const endAngle = startAngle + sliceAngle;
		const sColor = sectorColors[colorIdx % sectorColors.length];
		g.beginFill(sColor, nodeAlpha);
		g.moveTo(pn.data.x, pn.data.y);
		g.arc(pn.data.x, pn.data.y, effR, startAngle, endAngle);
		g.lineTo(pn.data.x, pn.data.y);
		g.endFill();
		startAngle = endAngle;
		colorIdx++;
	}
	// Inner circle cutout
	g.beginFill(bgColor, 1);
	g.drawCircle(pn.data.x, pn.data.y, effR * innerR);
	g.endFill();
}

// ---------------------------------------------------------------------------
// Sunburst segment mode
// ---------------------------------------------------------------------------

/** Render sunburst arc segments for all visible nodes. */
export function renderSunburstSegmentMode(
	g: CanvasGraphics,
	ctx: DonutRenderCtx,
	crc: { filteredNodeAlpha: number },
): void {
	const { visible, tlFilteredOut, alpha, minWorldRadius } = ctx;
	const arcAngle = (SUNBURST_SEGMENT_ARC_DEG * Math.PI) / 180;

	for (let i = 0; i < visible.length; i++) {
		const pn = visible[i];
		const effR = Math.max(pn.radius, minWorldRadius);
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		const angleOffset = (i / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
		const startAngle = angleOffset - arcAngle / 2;
		const endAngle = angleOffset + arcAngle / 2;

		const strokeColor = darkenColor(pn.color, RING_STROKE_DARKEN);
		g.lineStyle(1, strokeColor, nodeAlpha * RING_STROKE_ALPHA);
		g.beginFill(pn.color, nodeAlpha);
		g.moveTo(pn.data.x, pn.data.y);
		g.arc(pn.data.x, pn.data.y, effR, startAngle, endAngle);
		g.lineTo(pn.data.x, pn.data.y);
		g.endFill();
	}
}
