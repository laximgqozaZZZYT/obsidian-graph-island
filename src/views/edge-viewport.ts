import type { EdgeDrawConfig } from "./EdgeRenderer";

interface ViewportBounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export function computeEdgeViewport(cfg: EdgeDrawConfig, margin = 200): ViewportBounds {
	const ws = cfg.worldScale ?? 1;
	const vx = cfg.viewportX ?? 0;
	const vy = cfg.viewportY ?? 0;
	const vw = cfg.viewportW ?? 10000;
	const vh = cfg.viewportH ?? 10000;
	return {
		left: -vx / ws - margin,
		right: (vw - vx) / ws + margin,
		top: -vy / ws - margin,
		bottom: (vh - vy) / ws + margin,
	};
}

export function isBothEndpointsOutside(
	src: { x: number; y: number },
	tgt: { x: number; y: number },
	vp: ViewportBounds,
): boolean {
	const srcOut = src.x < vp.left || src.x > vp.right || src.y < vp.top || src.y > vp.bottom;
	const tgtOut = tgt.x < vp.left || tgt.x > vp.right || tgt.y < vp.top || tgt.y > vp.bottom;
	return srcOut && tgtOut;
}
