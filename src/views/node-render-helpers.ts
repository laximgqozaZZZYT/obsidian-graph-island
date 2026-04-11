/**
 * Pure helper functions extracted from RenderPipeline._renderNodeMode
 * to reduce cyclomatic complexity.
 */

export interface DenseStrokeConfig {
	zoomLow: number;
	zoomMid: number;
	maxWidth: number;
	midWidth: number;
}

export function computeZoomNodeBoost(worldScale: number): number {
	return worldScale < 0.5 ? 1 + (0.5 - worldScale) * 0.5 : 1;
}

export function computeBaseStrokeWidth(
	worldScale: number,
	highContrast: boolean,
	ds: DenseStrokeConfig,
): number {
	const hcMul = highContrast ? 2 : 1;
	const raw =
		worldScale < ds.zoomLow
			? Math.min(2 / worldScale, ds.maxWidth)
			: worldScale < ds.zoomMid
				? ds.midWidth
				: 1;
	return raw * hcMul;
}

export function computeNodeAlpha(
	baseAlpha: number,
	filteredOut: boolean,
	filteredNodeAlpha: number,
	worldScale: number,
	sortRank: number,
	prominentN: number,
	fadeLowDegreeFloor: number,
): number {
	let a = filteredOut ? baseAlpha * filteredNodeAlpha : baseAlpha;
	if (worldScale < 0.3 && sortRank >= 0 && sortRank >= prominentN * 2) {
		a *= Math.max(fadeLowDegreeFloor, worldScale / 0.3);
	}
	return a;
}

export function resolveNodeDrawColor(
	color: number,
	sortRank: number,
	prominentN: number,
	nonPromSat: number,
	desaturate: (c: number, s: number) => number,
): number {
	if (sortRank >= 0 && sortRank >= prominentN) {
		return desaturate(color, nonPromSat);
	}
	return color;
}
