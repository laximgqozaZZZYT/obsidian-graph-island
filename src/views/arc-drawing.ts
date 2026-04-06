/**
 * Pure geometry helpers for drawing arcs and sunburst labels.
 * Extracted from GraphViewContainer to reduce god-object size.
 */
import type { SunburstArcEnriched } from "../layouts/sunburst";
import { CanvasGraphics, CanvasText } from "./canvas2d";

// ---------------------------------------------------------------------------
// Arc geometry
// ---------------------------------------------------------------------------

/** Trace arc points onto gfx. `moveFirst` controls whether the first point uses moveTo. */
function traceArc(
	gfx: CanvasGraphics,
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
	steps: number,
	moveFirst: boolean,
): void {
	for (let i = 0; i <= steps; i++) {
		const a = startAngle + (i / steps) * (endAngle - startAngle);
		const x = cx + r * Math.cos(a);
		const y = cy + r * Math.sin(a);
		if (i === 0 && moveFirst) gfx.moveTo(x, y);
		else gfx.lineTo(x, y);
	}
}

function arcSteps(startAngle: number, endAngle: number): number {
	return Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));
}

/** Draw an arc line (stroke only, no fill). */
export function drawArcLine(
	gfx: CanvasGraphics,
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
): void {
	traceArc(gfx, cx, cy, r, startAngle, endAngle, arcSteps(startAngle, endAngle), true);
}

/** Draw a baumkuchen-shaped arc path (annular sector) for fills. */
export function drawArcPath(
	gfx: CanvasGraphics,
	cx: number,
	cy: number,
	rInner: number,
	rOuter: number,
	startAngle: number,
	endAngle: number,
): void {
	const steps = arcSteps(startAngle, endAngle);
	traceArc(gfx, cx, cy, rOuter, startAngle, endAngle, steps, true);
	traceArc(gfx, cx, cy, rInner, endAngle, startAngle, steps, false);
	gfx.closePath();
}

// ---------------------------------------------------------------------------
// Sunburst arc label
// ---------------------------------------------------------------------------

/** Create a positioned and rotated label for a sunburst arc. */
export function createSunburstArcLabel(
	arc: SunburstArcEnriched,
	fontSize: number,
	textColor: number,
): CanvasText {
	const midAngle = (arc.startAngle + arc.endAngle) / 2;
	const midR = (arc.rInner + arc.rOuter) / 2;
	const displayName = arc.groupKey.replace(/::.*$/, "").split("/").pop() || arc.groupKey;
	const text = new CanvasText(displayName, {
		fontSize: arc.depth === 0 ? fontSize * 1.2 : fontSize,
		fill: textColor,
		fontWeight: arc.depth === 0 ? "bold" : "600",
		align: "center",
	});
	text.anchor.set(0.5, 0.5);
	text.strokeColor = 0x000000;
	text.strokeWidth = arc.depth === 0 ? 3 : 2;
	text.x = arc.cx + midR * Math.cos(midAngle);
	text.y = arc.cy + midR * Math.sin(midAngle);
	let rotation = midAngle + Math.PI / 2;
	if (rotation > Math.PI / 2 && rotation < (3 * Math.PI) / 2) {
		rotation += Math.PI;
	}
	text.rotation = rotation;
	return text;
}
