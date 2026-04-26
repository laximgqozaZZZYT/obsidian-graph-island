/**
 * Label font-size pure helpers.
 *
 * Extracted from LabelManager / RenderPipeline to keep god objects from
 * growing further (see CLAUDE.md GOD OBJECT Policy). All functions in this
 * file MUST stay free of side-effects, DOM access, and Pixi/Canvas imports.
 */

/**
 * Compute the effective on-screen font size (in CSS pixels) for a label
 * drawn at a given world scale, guaranteeing a fixed minimum readable size.
 *
 * Background — at extreme zoom-out the LabelManager counter-scale gets
 * capped by `labelScaleMaxExtreme`, which means the actual rendered font
 * can drop well below `labelMinScreenPx`. This helper expresses the hard
 * floor that downstream rendering can apply once all scaling is resolved.
 *
 * @param rawFontSize  Label's intrinsic font size in world coordinates.
 * @param worldScale   Current world container scale (zoom). 1 = 100%.
 * @param minPx        Hard floor — minimum allowed screen-pixel font size.
 * @returns            Screen-pixel font size, never below `minPx` when
 *                     all inputs are finite and positive.
 */
export function computeLabelScreenFontSize(rawFontSize: number, worldScale: number, minPx: number): number {
	const safeMin = Number.isFinite(minPx) && minPx > 0 ? minPx : 0;
	if (!Number.isFinite(rawFontSize) || rawFontSize <= 0) return safeMin;
	if (!Number.isFinite(worldScale) || worldScale <= 0) return safeMin;
	const naturalScreenSize = rawFontSize * worldScale;
	return Math.max(safeMin, naturalScreenSize);
}
