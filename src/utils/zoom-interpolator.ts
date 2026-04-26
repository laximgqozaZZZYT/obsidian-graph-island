// ---------------------------------------------------------------------------
// zoom-interpolator.ts — ホイールズーム時のスムーズ補間（純粋関数）
// ---------------------------------------------------------------------------
// `InteractionManager` の smoothZoomTick / handleWheel から数値計算部のみを
// 切り出した純粋関数群。DOM・Pixi 依存なし。
//
// - `interpolateZoom`        : 現在スケールから目標スケールへの線形補間
// - `accumulateZoomTarget`   : ホイール delta から次の目標スケールを更新
//
// 既存 `views/InteractionManager.ts` のローカル定数 `SMOOTH_ZOOM_LERP=0.4` と
// `ZOOM_IN_FACTOR=1.1` を、ここでは関数引数化して `DEFAULT_ZOOM_SMOOTHING` /
// `DEFAULT_ZOOM_FACTOR` として export する（CLAUDE.md「ハードコード禁止」遵守：
// 名前付き定数として参照されるため、インライン数値ではない）。
// ---------------------------------------------------------------------------

/** Default per-frame smoothing factor for `interpolateZoom`.
 *  Matches the historical `SMOOTH_ZOOM_LERP` used in `InteractionManager`. */
export const DEFAULT_ZOOM_SMOOTHING = 0.4;

/** Default wheel-tick scale multiplier (zoom in).
 *  Matches the historical `ZOOM_IN_FACTOR` used in `InteractionManager`. */
export const DEFAULT_ZOOM_FACTOR = 1.1;

/**
 * Linearly interpolate `currentScale` toward `targetScale`.
 *
 * Effective interpolation weight is `clamp(smoothing * dt, 0, 1)`; this gives:
 *   - `dt = 0`            → returns `currentScale` (no movement)
 *   - `smoothing*dt >= 1` → snaps to `targetScale`
 *   - `target == current` → returns the same value (idempotent)
 *
 * Pure function — no DOM, Canvas, or global state.
 *
 * @param currentScale Current zoom scale (e.g. `world.scale.x`)
 * @param targetScale  Desired final zoom scale this gesture is converging on
 * @param dt           Time delta for this step. Use `1` for per-frame stepping
 *                     (matching the historical frame-rate-dependent behavior).
 * @param smoothing    Interpolation rate. `0` = frozen, `1` (with dt=1) = snap.
 * @returns Next interpolated scale value
 */
export function interpolateZoom(
	currentScale: number,
	targetScale: number,
	dt: number,
	smoothing: number,
): number {
	if (targetScale === currentScale) return currentScale;
	const raw = smoothing * dt;
	const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
	return currentScale + (targetScale - currentScale) * t;
}

/**
 * Update the wheel-zoom target scale from a wheel `deltaY` event.
 *
 * Sign convention matches `WheelEvent.deltaY`:
 *   - `wheelDelta < 0` → zoom IN  (multiply target by `zoomFactor`)
 *   - `wheelDelta > 0` → zoom OUT (divide target by `zoomFactor`)
 *   - `wheelDelta = 0` → target unchanged (still clamped to min/max)
 *
 * The result is clamped to `[minScale, maxScale]`.
 *
 * Pure function — no DOM, Canvas, or global state.
 *
 * @param currentTarget Current target scale (the value being eased toward)
 * @param wheelDelta    Wheel `deltaY`. Negative = zoom in, positive = zoom out.
 * @param zoomFactor    Per-tick multiplier (>1; e.g. 1.1). Inversed for zoom-out.
 * @param minScale      Lower clamp
 * @param maxScale      Upper clamp
 * @returns New clamped target scale
 */
export function accumulateZoomTarget(
	currentTarget: number,
	wheelDelta: number,
	zoomFactor: number,
	minScale: number,
	maxScale: number,
): number {
	const next =
		wheelDelta < 0
			? currentTarget * zoomFactor
			: wheelDelta > 0
				? currentTarget / zoomFactor
				: currentTarget;
	if (next < minScale) return minScale;
	if (next > maxScale) return maxScale;
	return next;
}
