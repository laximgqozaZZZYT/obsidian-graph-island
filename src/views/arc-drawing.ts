/**
 * Pure geometry helpers for drawing arcs and sunburst labels.
 * Extracted from GraphViewContainer to reduce god-object size.
 */
import type { SunburstArcEnriched } from "../layouts/sunburst";
import { CanvasGraphics, CanvasText } from "./canvas2d";

// ---------------------------------------------------------------------------
// Arc geometry
// ---------------------------------------------------------------------------

/** Draw an arc line (stroke only, no fill). */
export function drawArcLine(
	gfx: CanvasGraphics,
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
): void {
	const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const a = startAngle + t * (endAngle - startAngle);
		const x = cx + r * Math.cos(a);
		const y = cy + r * Math.sin(a);
		if (i === 0) gfx.moveTo(x, y);
		else gfx.lineTo(x, y);
	}
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
	const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));

	// Outer arc (clockwise)
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const a = startAngle + t * (endAngle - startAngle);
		const x = cx + rOuter * Math.cos(a);
		const y = cy + rOuter * Math.sin(a);
		if (i === 0) gfx.moveTo(x, y);
		else gfx.lineTo(x, y);
	}

	// Inner arc (counter-clockwise)
	for (let i = steps; i >= 0; i--) {
		const t = i / steps;
		const a = startAngle + t * (endAngle - startAngle);
		const x = cx + rInner * Math.cos(a);
		const y = cy + rInner * Math.sin(a);
		gfx.lineTo(x, y);
	}

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
