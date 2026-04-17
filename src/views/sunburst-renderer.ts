/**
 * Sunburst ViewMode rendering — extracted from GraphViewContainer to reduce god-object size.
 *
 * All functions are standalone and receive their dependencies as parameters.
 */

import { CanvasText } from "./canvas2d";
import type { CanvasGraphics, CanvasContainer } from "./canvas2d";
import type { SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import { DEFAULT_COLORS } from "../types";
import { cssColorToHex } from "../utils/graph-helpers";
import { cleanArcName, lightenHex } from "../utils/gvc-helpers";
import { drawArcPath } from "./arc-drawing";

// ---------------------------------------------------------------------------
// Tooltip content builder (pure)
// ---------------------------------------------------------------------------

interface SunburstTooltipLines {
	lines: string[];
}

/**
 * Compute tooltip content for a hovered sunburst group.
 * Pure function — no DOM side-effects.
 */
export function buildSunburstTooltipContent(arcs: LayoutSunburstArc[], groupName: string): SunburstTooltipLines {
	let leafCount = 0;
	const depth2Names: string[] = [];
	for (const arc of arcs) {
		if (arc.depth === 1 && arc.name === groupName) continue;
		if (arc.depth >= 2) {
			let isChild = false;
			for (const parent of arcs) {
				if (parent.depth === 1 && parent.name === groupName && parent.x0 <= arc.x0 && parent.x1 >= arc.x1) {
					isChild = true;
					break;
				}
			}
			if (!isChild) continue;
			if (arc.depth === 2 && depth2Names.length < 5) {
				depth2Names.push(cleanArcName(arc.name));
			}
			if (!arc.filePath && arc.value) leafCount += arc.value;
			if (arc.filePath) leafCount++;
		}
	}

	const displayName = cleanArcName(groupName);
	const lines = [displayName];
	if (leafCount > 0) lines.push(`${leafCount} files`);
	if (depth2Names.length > 0) lines.push(depth2Names.join(", "));
	return { lines };
}

// ---------------------------------------------------------------------------
// Sunburst layout arc drawing
// ---------------------------------------------------------------------------

/** Parameters for drawSunburstLayoutArcs. */
interface SunburstArcDrawParams {
	gfx: CanvasGraphics;
	arcs: LayoutSunburstArc[];
	cx: number;
	cy: number;
	worldScale: number;
	isSunburstView: boolean;
	hoveredGroup: string | null;
	/** Optional override for arc path drawing (used for testing). */
	drawArcPath?: (
		gfx: CanvasGraphics,
		cx: number,
		cy: number,
		rInner: number,
		rOuter: number,
		startAngle: number,
		endAngle: number,
	) => void;
}

/** Resolved fill + line style for a single sunburst arc. */
interface ArcStyle {
	color: number;
	fillAlpha: number;
	lineColor: number;
	lineWidth: number;
	lineAlpha: number;
}

/**
 * Compute the fill and line style for a sunburst arc.
 * Pure function — no canvas side-effects.
 */
function computeArcStyle(
	baseColor: number,
	depth: number,
	maxDepth: number,
	isSunburstView: boolean,
	isDimmed: boolean,
	isHovered: boolean,
	worldScale: number,
): ArcStyle {
	let color = baseColor;
	if (isSunburstView) {
		const lightenFactor = depth > 1 ? ((depth - 1) / maxDepth) * 0.4 : 0;
		color = lightenHex(color, lightenFactor);
		let fillAlpha = Math.max(0.5, 0.85 - depth * 0.06);
		if (isDimmed) fillAlpha *= 0.4;
		else if (isHovered) fillAlpha = Math.min(1, fillAlpha * 1.2);
		return {
			color,
			fillAlpha,
			lineColor: 0xffffff,
			lineWidth: Math.max(1, 1.5 / worldScale),
			lineAlpha: isDimmed ? 0.2 : 0.6,
		};
	}
	let fillAlpha = depth === 1 ? 0.25 : 0.15;
	if (isDimmed) fillAlpha *= 0.3;
	return {
		color,
		fillAlpha,
		lineColor: color,
		lineWidth: Math.max(0.5, 1.0 / worldScale),
		lineAlpha: isDimmed ? 0.2 : 0.5,
	};
}

/**
 * Draw sunburst layout arcs behind nodes using CanvasGraphics.
 * Extracted from GraphViewContainer.drawSunburstLayoutArcs.
 */
export function drawSunburstLayoutArcs(params: SunburstArcDrawParams): void {
	const { gfx, arcs, cx, cy, worldScale, isSunburstView, hoveredGroup } = params;
	const drawArc = params.drawArcPath ?? drawArcPath;

	// Assign colors by depth-1 group (top-level category)
	const groupColorMap = new Map<string, number>();
	let groupIdx = 0;
	for (const arc of arcs) {
		if (arc.depth === 1 && !groupColorMap.has(arc.name)) {
			groupColorMap.set(arc.name, groupIdx++);
		}
	}

	// Find depth-1 ancestor by angle range containment
	const arcGroupName = (arc: LayoutSunburstArc): string | null => {
		for (const a of arcs) {
			if (a.depth === 1 && a.x0 <= arc.x0 && a.x1 >= arc.x1) {
				return a.name;
			}
		}
		return null;
	};

	let maxDepth = 1;
	for (const arc of arcs) {
		if (arc.depth > maxDepth) maxDepth = arc.depth;
	}

	for (let i = 0; i < arcs.length; i++) {
		const arc = arcs[i];
		if (arc.depth === 0) continue;

		const groupName = arc.depth === 1 ? arc.name : (arcGroupName(arc) ?? arc.name);
		const ci = groupColorMap.get(groupName) ?? 0;
		const baseColor = cssColorToHex(DEFAULT_COLORS[ci % DEFAULT_COLORS.length]);

		const isHovered = hoveredGroup !== null && groupName === hoveredGroup;
		const isDimmed = hoveredGroup !== null && !isHovered;
		const style = computeArcStyle(baseColor, arc.depth, maxDepth, isSunburstView, isDimmed, isHovered, worldScale);

		gfx.lineStyle(style.lineWidth, style.lineColor, style.lineAlpha);
		gfx.beginFill(style.color, style.fillAlpha);

		// Draw annular sector: offset angles by -PI/2 so top is 0
		drawArc(gfx, cx, cy, arc.y0, arc.y1, arc.x0 - Math.PI / 2, arc.x1 - Math.PI / 2);
		gfx.endFill();
	}
}

// ---------------------------------------------------------------------------
// Sunburst label rendering
// ---------------------------------------------------------------------------

/** Parameters for drawSunburstLabels. */
interface SunburstLabelDrawParams {
	arcs: LayoutSunburstArc[];
	cx: number;
	cy: number;
	container: CanvasContainer;
	gfx: CanvasGraphics | null;
	worldScale: number;
	isSunburstView: boolean;
	isDark: boolean;
	cullOverlappingRotatedLabels: (labels: Map<string, CanvasText>) => void;
}

/**
 * Draw sunburst labels (depth-1 outer with leader lines, depth-2 inside arcs).
 * Returns the new label map.
 */
export function drawSunburstLabels(params: SunburstLabelDrawParams): Map<string, CanvasText> {
	const { arcs, cx, cy, container, gfx, worldScale, isSunburstView, isDark, cullOverlappingRotatedLabels } = params;

	const labels = new Map<string, CanvasText>();
	const textColor = isDark ? 0xdddddd : 0x333333;
	const subtextColor = isDark ? 0xaaaaaa : 0x666666;

	// Find max outer radius for leader line start
	let maxOuterR = 0;
	for (const arc of arcs) {
		if (arc.y1 > maxOuterR) maxOuterR = arc.y1;
	}
	const leaderStart = maxOuterR + 4 / worldScale;
	const leaderEnd = maxOuterR + 30 / worldScale;
	const fontSize = Math.max(8, 11 / worldScale);
	const depth2FontSize = Math.max(5, 8 / worldScale);
	const minSweep = 0.06; // ~3.4deg -- skip tiny arcs
	const depth2MinSweep = 0.2; // ~11.5deg -- wider threshold for inner labels

	// --- Depth 1 labels (outer, with leader lines) ---
	for (const arc of arcs) {
		if (arc.depth !== 1) continue;
		if (arc.x1 - arc.x0 < minSweep) continue;

		const midAngle = (arc.x0 + arc.x1) / 2 - Math.PI / 2;
		const displayName = cleanArcName(arc.name);

		if (isSunburstView && gfx) {
			const x1 = cx + leaderStart * Math.cos(midAngle);
			const y1 = cy + leaderStart * Math.sin(midAngle);
			const x2 = cx + leaderEnd * Math.cos(midAngle);
			const y2 = cy + leaderEnd * Math.sin(midAngle);
			gfx.lineStyle(Math.max(0.5, 1 / worldScale), textColor, 0.5);
			gfx.moveTo(x1, y1);
			gfx.lineTo(x2, y2);
		}

		const labelR = isSunburstView ? leaderEnd + 4 / worldScale : (arc.y0 + arc.y1) / 2;
		const lx = cx + labelR * Math.cos(midAngle);
		const ly = cy + labelR * Math.sin(midAngle);

		const text = new CanvasText(displayName, {
			fontSize,
			fill: textColor,
			fontWeight: "bold",
			align: "center",
		});

		const isRight = midAngle > -Math.PI / 2 && midAngle < Math.PI / 2;
		text.anchor.set(isRight ? 0 : 1, 0.5);
		text.x = lx;
		text.y = ly;
		text.rotation = 0;

		container.addChild(text);
		labels.set(`d1:${arc.name}`, text);
	}

	// --- Depth 2 labels (inside arcs, curved text placement) ---
	if (isSunburstView) {
		for (const arc of arcs) {
			if (arc.depth !== 2) continue;
			if (arc.x1 - arc.x0 < depth2MinSweep) continue;

			const midAngle = (arc.x0 + arc.x1) / 2 - Math.PI / 2;
			const midR = (arc.y0 + arc.y1) / 2;
			const lx = cx + midR * Math.cos(midAngle);
			const ly = cy + midR * Math.sin(midAngle);
			const displayName = cleanArcName(arc.name);

			const text = new CanvasText(displayName, {
				fontSize: depth2FontSize,
				fill: subtextColor,
				fontWeight: "normal",
				align: "center",
			});

			// Rotate label along arc direction
			let rotation = midAngle + Math.PI / 2;
			// Flip text on bottom half to keep it readable
			if (midAngle > 0 && midAngle < Math.PI) {
				rotation += Math.PI;
			}
			text.anchor.set(0.5, 0.5);
			text.x = lx;
			text.y = ly;
			text.rotation = rotation;

			container.addChild(text);
			labels.set(`d2:${arc.name}:${arc.x0.toFixed(3)}`, text);
		}
	}

	cullOverlappingRotatedLabels(labels);
	return labels;
}

// ---------------------------------------------------------------------------
// Clear sunburst labels
// ---------------------------------------------------------------------------

/**
 * Remove all sunburst layout labels and reset hover state.
 */
export function clearSunburstLabels(
	labels: Map<string, CanvasText>,
	labelContainer: CanvasContainer | null,
	tooltipEl: HTMLElement | null,
): void {
	for (const lbl of labels.values()) {
		lbl.parent?.removeChild(lbl);
		lbl.destroy();
	}
	labels.clear();
	if (labelContainer) labelContainer.visible = false;
	if (tooltipEl) tooltipEl.style.display = "none";
}
