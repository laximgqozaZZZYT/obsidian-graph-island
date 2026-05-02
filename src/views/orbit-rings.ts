/**
 * Pure renderer for concentric-layout orbit rings.
 * Extracted from GraphViewContainer to reduce god-object size.
 */
import type { ShellInfo } from "../types";
import type { IGraphics } from "./canvas2d/interfaces";

const RING_COLOR_DARK = 0x888888;
const RING_COLOR_LIGHT = 0xaaaaaa;
const RING_ALPHA_INNER = 0.3;
const RING_ALPHA_FADE = 0.15;
const RING_LINE_WIDTH_INNER = 1.5;
const RING_LINE_WIDTH_FADE = 0.5;

/**
 * Draw concentric orbit rings for the given shells.
 *
 * Inner shells are slightly more visible (alpha 0.30, line 1.5px) and outer
 * shells fade toward (alpha 0.15, line 1.0px). Caller is responsible for any
 * gating (e.g. layout / visibility flags) and must call `gfx.clear()` before
 * invoking if desired.
 *
 * @param gfx    Target graphics surface.
 * @param shells Concentric shells to render.
 * @param isDark Theme flag: true → darker stroke, false → lighter stroke.
 */
export function drawOrbitRings(gfx: IGraphics, shells: ReadonlyArray<ShellInfo>, isDark: boolean): void {
	const n = shells.length;
	if (n === 0) return;
	const ringColor = isDark ? RING_COLOR_DARK : RING_COLOR_LIGHT;
	for (let i = 0; i < n; i++) {
		const shell = shells[i];
		if (shell.radius <= 0) continue;
		const t = n > 1 ? i / (n - 1) : 0;
		const ringAlpha = RING_ALPHA_INNER - t * RING_ALPHA_FADE;
		const lineWidth = RING_LINE_WIDTH_INNER - t * RING_LINE_WIDTH_FADE;
		gfx.lineStyle(lineWidth, ringColor, ringAlpha);
		gfx.drawCircle(shell.centerX, shell.centerY, shell.radius);
	}
}
