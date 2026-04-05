/**
 * Pure utility functions extracted from RenderPipeline for testability.
 * No DOM/Canvas dependency — all functions are pure.
 */
import { hexToRgb, wcagContrastRatio, contrastColor, getLuminance } from "../utils/color";

// ---------------------------------------------------------------------------
// Color utilities (previously in RenderPipeline.ts)
// ---------------------------------------------------------------------------

/** Darken a hex color by mixing toward black. factor 0 = unchanged, 1 = black. */
export function darkenColor(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	const dr = r * (1 - factor);
	const dg = g * (1 - factor);
	const db = b * (1 - factor);
	return (Math.round(dr) << 16) | (Math.round(dg) << 8) | Math.round(db);
}

/** Lighten a hex color by mixing toward white. factor 0 = unchanged, 1 = white. */
export function lightenColor(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	const lr = r + (255 - r) * factor;
	const lg = g + (255 - g) * factor;
	const lb = b + (255 - b) * factor;
	return (Math.round(lr) << 16) | (Math.round(lg) << 8) | Math.round(lb);
}

/** Blend two hex colors. t=0 returns a, t=1 returns b. */
export function blendColors(a: number, b: number, t: number): number {
	const ar = hexToRgb(a),
		br = hexToRgb(b);
	return (
		(Math.round(ar.r + (br.r - ar.r) * t) << 16) |
		(Math.round(ar.g + (br.g - ar.g) * t) << 8) |
		Math.round(ar.b + (br.b - ar.b) * t)
	);
}

/** Desaturate a 0xRRGGBB color toward gray. factor=1 is original, factor=0 is fully gray. */
export function desaturateColor(color: number, factor: number): number {
	if (factor >= 1) return color;
	const { r, g, b } = hexToRgb(color);
	const gray = Math.round(getLuminance(r, g, b));
	const nr = Math.round(gray + (r - gray) * factor);
	const ng = Math.round(gray + (g - gray) * factor);
	const nb = Math.round(gray + (b - gray) * factor);
	return (nr << 16) | (ng << 8) | nb;
}

// ---------------------------------------------------------------------------
// Glow attenuation
// ---------------------------------------------------------------------------

/** Glow attenuation node count threshold (above this, glow starts fading) */
export const GLOW_ATTENUATE_THRESHOLD = 300;
/** Glow attenuation range (from threshold to threshold+range, glow fades to zero) */
export const GLOW_ATTENUATE_RANGE = 500;
/** Glow radius attenuation max factor */
export const GLOW_RADIUS_ATTENUATE_FACTOR = 0.7;
/** P90 percentile fraction for hub node glow detection */
export const GLOW_P90_FRACTION = 0.9;

/**
 * Compute attenuated glow alpha and radius for large node counts.
 * Pure function — no DOM/Canvas dependency.
 */
export function computeGlowParams(
	nodeCount: number,
	glowBaseAlpha: number,
	glowBaseRadius: number,
): { glowAlpha: number; glowRadius: number } {
	const glowAlpha =
		nodeCount < GLOW_ATTENUATE_THRESHOLD
			? glowBaseAlpha
			: glowBaseAlpha * (1 - (nodeCount - GLOW_ATTENUATE_THRESHOLD) / GLOW_ATTENUATE_RANGE);
	const glowRadius =
		nodeCount < GLOW_ATTENUATE_THRESHOLD
			? glowBaseRadius
			: glowBaseRadius -
				GLOW_RADIUS_ATTENUATE_FACTOR * ((nodeCount - GLOW_ATTENUATE_THRESHOLD) / GLOW_ATTENUATE_RANGE);
	return { glowAlpha, glowRadius };
}

// ---------------------------------------------------------------------------
// Label color computation
// ---------------------------------------------------------------------------

/**
 * Compute label background and fill colors based on theme and sync settings.
 * Pure function — no DOM/Canvas dependency.
 */
export function computeLabelColors(
	isDarkTheme: boolean,
	rt: {
		labelBgColor: number;
		labelBgColorLight: number;
		labelBgColorSync: boolean;
		labelTextColorSync: boolean;
	},
	isSuperNode: boolean,
	color: number,
): { labelBg: number; labelFill: number } {
	const themeLabelBg = isDarkTheme ? rt.labelBgColor : rt.labelBgColorLight;
	const syncBg = rt.labelBgColorSync && color != null;
	const labelBg = isSuperNode
		? (color != null ? darkenColor(color, 0.6) : themeLabelBg)
		: syncBg ? blendColors(themeLabelBg, color, 0.15) : themeLabelBg;
	let labelFill = isSuperNode ? 0xffffff : isDarkTheme ? 0xe0e0e0 : 0x222222;
	if (!isSuperNode && rt.labelTextColorSync && color != null) {
		labelFill = isDarkTheme ? lightenColor(color, 0.55) : darkenColor(color, 0.35);
	}
	if (wcagContrastRatio(labelFill, labelBg) < 4.5) labelFill = contrastColor(labelBg);
	return { labelBg, labelFill };
}

// ---------------------------------------------------------------------------
// Density grid proximity check
// ---------------------------------------------------------------------------

/**
 * Check if a point is too close to any existing point in a spatial density grid.
 * Pure function — no DOM/Canvas dependency.
 */
export function isDensityTooClose(
	cx: number, cy: number, bucketSize: number, minDist2: number,
	grid: Map<string, { cx: number; cy: number }[]>,
): boolean {
	const bx = Math.floor(cx / bucketSize);
	const by = Math.floor(cy / bucketSize);
	for (let ddx = -1; ddx <= 1; ddx++) {
		for (let ddy = -1; ddy <= 1; ddy++) {
			const neighbors = grid.get(`${bx + ddx},${by + ddy}`);
			if (!neighbors) continue;
			for (const nb of neighbors) {
				if ((cx - nb.cx) ** 2 + (cy - nb.cy) ** 2 < minDist2) return true;
			}
		}
	}
	return false;
}
