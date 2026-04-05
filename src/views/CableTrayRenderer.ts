/**
 * CableTrayRenderer — pure computation / layout functions for the cable-tray
 * wiring model.  Extracted from EdgeRenderer to reduce its size.
 *
 * Everything here is side-effect-free: no CanvasGraphics, no module-level
 * caches.  Drawing code stays in EdgeRenderer which imports these helpers.
 */

import type { GraphEdge } from "../types";
import { edgeSourceId, edgeTargetId, incCounter } from "../utils/graph-helpers";
import type { EdgeDrawConfig, GroupBBox, BBoxFace, JunctionGrid } from "./EdgeRenderer";
import {
	resolveEdgeColor,
	computeGraphCenter,
	computeGroupBBox,
	computePortFace,
	faceCenter,
	facePerpendicular,
	buildPerimeterPath,
	computeJunctionGrid,
	filterGridForPortFace,
	routeViaJunctionGrid,
	findNearestGap,
	angleDist,
	shortestAngleDelta,
	mergeNearbyValues,
	deduplicatePath,
	FADE_BY_DEGREE_MIN_ALPHA,
	WEIGHT_THICKNESS_FACTOR,
} from "./EdgeRenderer";

// Re-export types / interfaces consumed by EdgeRenderer drawing code
// ---------------------------------------------------------------------------

/** 引込口の方向 */
export type { BBoxFace };

/** 引き込み口: 各グループに1つ、接続先グループ方向の平均ベクトルで配置 */
export interface GroupPort {
	groupKey: string;
	x: number;
	y: number;
	/** Perpendicular direction at the port (tangent to group boundary).
	 *  Used to spread wires consistently on both trunk and internal sides. */
	perpX: number;
	perpY: number;
}

/** 幹線: グループペア間を結ぶ。内部にケーブルを収容。1ペア1本。 */
export interface Trunk {
	pairKey: string;
	srcGroup: string;
	tgtGroup: string;
	path: { x: number; y: number }[];
	cables: TrunkCable[];
	allEdges: GraphEdge[];
}

/** 幹線内のケーブル: 同一色のエッジをまとめる */
export interface TrunkCable {
	color: number;
	edges: GraphEdge[];
}

/** ノードポート: ノード位置の参照 */
export interface NodePort {
	nodeId: string;
	x: number;
	y: number;
}

/** グループ内ケーブル: 同一グループ内のエッジ配線 */
export interface IntraGroupCable {
	groupKey: string;
	junction: { x: number; y: number };
	branches: { nodePort: NodePort; path: { x: number; y: number }[]; edges: GraphEdge[] }[];
	groupPortBranch: { path: { x: number; y: number }[]; edges: GraphEdge[] } | null;
}

/** Cable routing options */
export interface CableRouteOpts {
	/** Row gap midpoints for cartesian L-shape routing */
	rowGaps?: number[];
	/** Polar mode: center of the coordinate system */
	center?: { x: number; y: number };
	/** Polar mode: ring gap radii (midpoints between adjacent node rings) */
	ringGaps?: number[];
}

/** Pre-computed perimeter info for a group (used by cable routing helpers). */
export interface GroupPerimInfo {
	bbox: GroupBBox;
	face: BBoxFace;
	port: { x: number; y: number };
	perimeterPath: { x: number; y: number }[];
	grid: JunctionGrid;
	polarGrid?: PolarJunctionGrid;
}

/** Junction grid for polar coordinate groups */
export interface PolarJunctionGrid {
	/** Sorted ring radii where nodes are placed (relative to group center) */
	rings: number[];
	/** Sorted angles (radians) where nodes are placed */
	angles: number[];
	/** Midpoint radii between adjacent rings (routing corridors) */
	ringGaps: number[];
	/** Midpoint angles between adjacent node angles (routing corridors) */
	angleGaps: number[];
	/** Group center in world coordinates */
	cx: number;
	cy: number;
}

/** Shared color→lane mapping per group port */
export interface PortLaneInfo {
	colors: number[];
	/** Port coordinates */
	portX: number;
	portY: number;
	/** Shared perpendicular direction at the port (tangent to group boundary) */
	perpX: number;
	perpY: number;
}
export type PortColorLanes = Map<string, PortLaneInfo>;

/** Result of cable preparation phase. */
export interface CablePrepResult {
	hasClusters: boolean;
	cabledEdgeIds: Set<string>;
	intraHandledIds: Set<string>;
}

// Minimal position data needed for source/target
interface Pos {
	x: number;
	y: number;
	id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Highlighted cable trunk width */
export const HIGHLIGHT_CABLE_TRUNK_WIDTH = 3;
/** Cable fan crowd attenuation threshold (edges) */
export const CABLE_FAN_CROWD_THRESHOLD = 6.0;
/** Cable fan crowd min alpha fraction */
export const CABLE_FAN_CROWD_MIN_FRACTION = 0.4;
/** Cable lane spacing in screen pixels — wide enough to distinguish parallel cables */
export const CABLE_LANE_SPACING = 14;
/** Trunk conduit alpha — semi-transparent so wires show through */
export const TRUNK_CONDUIT_ALPHA = 0.12;
/** Wire alpha — most opaque layer, clearly visible */
export const WIRE_BASE_ALPHA = 0.9;
/** Wire spacing within a cable (screen pixels between parallel wires) */
export const STUB_WIRE_SPACING = 7;
/** Maximum conduit width in screen pixels */
export const MAX_CONDUIT_WIDTH = 16;
/** Trunk conduit screen width (px) — thickest layer */
export const TRUNK_SCREEN_WIDTH = 12;
/** Cable conduit screen width (px) — medium layer */
export const CABLE_SCREEN_WIDTH = 6;
/** Wire screen width (px) — thinnest layer */
export const WIRE_SCREEN_WIDTH = 2.5;
/** Default fallback cluster radius */
export const DEFAULT_CLUSTER_RADIUS = 50;

// ---------------------------------------------------------------------------
// Zoom fade
// ---------------------------------------------------------------------------

/** Zoom-out fade for intra-group cables (does NOT affect trunks).
 *  Returns 1.0 at zoom >= 0.5, fading to 0.05 at zoom <= 0.15. */
export function zoomFadeAlpha(zoom: number): number {
	if (zoom >= 0.5) return 1;
	if (zoom <= 0.15) return 0.05;
	return 0.05 + (0.95 * (zoom - 0.15)) / (0.5 - 0.15);
}

// ---------------------------------------------------------------------------
// Trunk path builders
// ---------------------------------------------------------------------------

/**
 * Build a Manhattan (L-shaped) path from point A to point B.
 * The path follows grid-aligned segments: first horizontal, then vertical.
 */
export function buildManhattanPath(
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number }[] {
	const dx = b.x - a.x;
	const dy = b.y - a.y;

	// If nearly aligned (within 5% of distance), go straight
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 1) return [a, b];
	if (Math.abs(dx) < dist * 0.05 || Math.abs(dy) < dist * 0.05) {
		return [a, b];
	}

	// Use the option with longer first segment for cleaner visual
	const useBend1 = Math.abs(dx) >= Math.abs(dy);
	const bend = useBend1 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };

	return [a, bend, b];
}

/** Horizontal-priority trunk path: go horizontal first, then vertical.
 *  Used for horizontal/timeline arrangements where groups are side-by-side. */
export function buildHorizontalTrunkPath(
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number }[] {
	const dx = b.x - a.x,
		dy = b.y - a.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 1) return [a, b];
	if (Math.abs(dy) < dist * 0.05) return [a, b]; // nearly horizontal
	// Horizontal first, then vertical
	return [a, { x: b.x, y: a.y }, b];
}

/** Vertical-priority trunk path: go vertical first, then horizontal.
 *  Used for vertical arrangements where groups are stacked. */
export function buildVerticalTrunkPath(
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number }[] {
	const dx = b.x - a.x,
		dy = b.y - a.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 1) return [a, b];
	if (Math.abs(dx) < dist * 0.05) return [a, b]; // nearly vertical
	// Vertical first, then horizontal
	return [a, { x: a.x, y: b.y }, b];
}

/**
 * Build a polar trunk path from point A to point B via arc + radial segments.
 * Route: A -> radial to arcR -> arc at arcR -> radial to B
 * where arcR is a shared radius for the arc segment (midpoint of the two radii).
 */
export function buildPolarTrunkPath(
	a: { x: number; y: number },
	b: { x: number; y: number },
	center: { x: number; y: number },
): { x: number; y: number }[] {
	const dxA = a.x - center.x,
		dyA = a.y - center.y;
	const dxB = b.x - center.x,
		dyB = b.y - center.y;
	const rA = Math.sqrt(dxA * dxA + dyA * dyA);
	const rB = Math.sqrt(dxB * dxB + dyB * dyB);
	const thetaA = Math.atan2(dyA, dxA);
	const thetaB = Math.atan2(dyB, dxB);

	// If nearly same angle, go straight (radial line)
	let angleDiff = thetaB - thetaA;
	if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
	if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
	if (Math.abs(angleDiff) < 0.05 || rA < 1 || rB < 1) return [a, b];

	// Arc radius: use the larger of the two (outer arc for clearance)
	const arcR = Math.max(rA, rB) * 1.1;

	// Generate arc waypoints from thetaA to thetaB at arcR
	const ARC_STEPS = Math.max(4, Math.ceil(Math.abs(angleDiff) / (Math.PI / 12)));
	const path: { x: number; y: number }[] = [a];

	// Radial step from A to arc radius (if needed)
	if (Math.abs(rA - arcR) > 5) {
		path.push({ x: center.x + arcR * Math.cos(thetaA), y: center.y + arcR * Math.sin(thetaA) });
	}

	// Arc waypoints
	for (let i = 1; i < ARC_STEPS; i++) {
		const t = i / ARC_STEPS;
		const theta = thetaA + angleDiff * t;
		path.push({ x: center.x + arcR * Math.cos(theta), y: center.y + arcR * Math.sin(theta) });
	}

	// Radial step from arc to B (if needed)
	if (Math.abs(rB - arcR) > 5) {
		path.push({ x: center.x + arcR * Math.cos(thetaB), y: center.y + arcR * Math.sin(thetaB) });
	}

	path.push(b);
	return path;
}

// ---------------------------------------------------------------------------
// Cable path computation
// ---------------------------------------------------------------------------

/**
 * Compute a cable path that avoids nodes by running through gaps.
 *
 * Cartesian: L-shape through row gaps
 *   from -> (from.x, gapY) -> (to.x, gapY) -> to
 *
 * Polar: arc through ring gaps
 *   from -> (radial to gapRing) -> (arc along gapRing) -> (radial to target) -> to
 */
export function computeCablePath(
	from: { x: number; y: number },
	to: { x: number; y: number },
	offset: number,
	opts?: CableRouteOpts,
): { x: number; y: number }[] {
	if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
		return [
			{ x: from.x, y: from.y },
			{ x: to.x, y: to.y },
		];
	}

	// -- Polar routing --
	if (opts?.center && opts?.ringGaps && opts.ringGaps.length > 0) {
		const cx = opts.center.x,
			cy = opts.center.y;
		const fromR = Math.sqrt((from.x - cx) ** 2 + (from.y - cy) ** 2);
		const toR = Math.sqrt((to.x - cx) ** 2 + (to.y - cy) ** 2);
		const fromA = Math.atan2(from.y - cy, from.x - cx);
		const toA = Math.atan2(to.y - cy, to.x - cx);

		// Pick the ring gap between from and to radii
		const midR = (fromR + toR) / 2;
		const gapR = findNearestGap(opts.ringGaps, midR) ?? opts.ringGaps[0];

		// Arc interpolation along the gap ring from fromAngle to toAngle
		let dAngle = toA - fromA;
		// Shortest arc direction
		if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
		if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

		const ARC_STEPS = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
		const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];

		// Radial move: from -> gap ring at from's angle
		path.push({ x: cx + gapR * Math.cos(fromA), y: cy + gapR * Math.sin(fromA) });

		// Arc along gap ring
		for (let i = 1; i < ARC_STEPS; i++) {
			const t = i / ARC_STEPS;
			const a = fromA + dAngle * t;
			path.push({ x: cx + gapR * Math.cos(a), y: cy + gapR * Math.sin(a) });
		}

		// Radial move: gap ring at to's angle -> to
		path.push({ x: cx + gapR * Math.cos(toA), y: cy + gapR * Math.sin(toA) });
		path.push({ x: to.x, y: to.y });

		return path;
	}

	// -- Cartesian routing --
	if (opts?.rowGaps && opts.rowGaps.length > 0) {
		const midY = (from.y + to.y) / 2;
		const nearest = findNearestGap(opts.rowGaps, midY) ?? opts.rowGaps[0];
		// Prefer a gap between from and to
		const minY = Math.min(from.y, to.y);
		const maxY = Math.max(from.y, to.y);
		const between = opts.rowGaps.filter((g) => g >= minY && g <= maxY);
		const gapY = (between.length > 0 ? findNearestGap(between, midY) : null) ?? nearest;
		return [
			{ x: from.x, y: from.y },
			{ x: from.x, y: gapY },
			{ x: to.x, y: gapY },
			{ x: to.x, y: to.y },
		];
	}

	// -- Fallback: perpendicular offset --
	const dx = to.x - from.x,
		dy = to.y - from.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	const perpX = -dy / len,
		perpY = dx / len;
	const sign = perpY >= 0 ? 1 : -1;
	return [
		{ x: from.x, y: from.y },
		{ x: (from.x + to.x) / 2 + perpX * offset * sign, y: (from.y + to.y) / 2 + perpY * offset * sign },
		{ x: to.x, y: to.y },
	];
}

// ---------------------------------------------------------------------------
// Polar center helper
// ---------------------------------------------------------------------------

/** Compute polar center from cluster centroids (returns undefined if not polar). */
export function computePolarCenter(
	cfg: Pick<EdgeDrawConfig, "coordinateSystem" | "clusterCentroids">,
): { x: number; y: number } | undefined {
	if (cfg.coordinateSystem !== "polar" || !cfg.clusterCentroids || cfg.clusterCentroids.size === 0) {
		return undefined;
	}
	let sx = 0,
		sy = 0;
	for (const c of cfg.clusterCentroids.values()) {
		sx += c.x;
		sy += c.y;
	}
	return { x: sx / cfg.clusterCentroids.size, y: sy / cfg.clusterCentroids.size };
}

// ---------------------------------------------------------------------------
// Polar junction grid
// ---------------------------------------------------------------------------

/** Compute a polar junction grid from node positions within a group. */
export function computePolarJunctionGrid(
	groupKey: string,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
	center: { x: number; y: number },
): PolarJunctionGrid {
	const radii: number[] = [];
	const angles: number[] = [];

	for (const [nid, gk] of nodeClusterMap) {
		if (gk !== groupKey) continue;
		const p = resolvePos(nid);
		if (!p) continue;
		const dx = p.x - center.x,
			dy = p.y - center.y;
		const r = Math.sqrt(dx * dx + dy * dy);
		const a = Math.atan2(dy, dx);
		radii.push(Math.round(r * 10) / 10);
		angles.push(a);
	}

	radii.sort((a, b) => a - b);
	angles.sort((a, b) => a - b);

	// Merge nearby radii (same approach as mergeNearbyValues for cartesian)
	let minSpacing = 20;
	if (radii.length >= 2) {
		const gaps: number[] = [];
		for (let i = 1; i < radii.length; i++) {
			const g = radii[i] - radii[i - 1];
			if (g > 1) gaps.push(g);
		}
		if (gaps.length > 0) {
			gaps.sort((a, b) => a - b);
			minSpacing = gaps[Math.floor(gaps.length / 2)] * 0.4;
		}
	}
	const mergedRings = mergeNearbyValues(radii, minSpacing);

	// Merge nearby angles (wrap-aware: consider gap between last and first+2pi)
	const minAngleSpacing = angles.length >= 2 ? Math.PI / (angles.length * 2) : 0.1;
	const mergedAngles = mergeNearbyValues(angles, minAngleSpacing);

	// Compute ring gaps (midpoints between adjacent merged rings)
	const ringGaps: number[] = [];
	for (let i = 0; i < mergedRings.length - 1; i++) {
		if (mergedRings[i + 1] - mergedRings[i] > minSpacing) {
			ringGaps.push((mergedRings[i] + mergedRings[i + 1]) / 2);
		}
	}

	// Compute angle gaps (midpoints between adjacent merged angles)
	const angleGaps: number[] = [];
	for (let i = 0; i < mergedAngles.length - 1; i++) {
		angleGaps.push((mergedAngles[i] + mergedAngles[i + 1]) / 2);
	}
	// Wrap-around gap: between last angle and first angle + 2pi
	if (mergedAngles.length >= 2) {
		const wrapGap = (mergedAngles[mergedAngles.length - 1] + mergedAngles[0] + Math.PI * 2) / 2;
		// Normalize to [-pi, pi]
		const normGap = wrapGap > Math.PI ? wrapGap - Math.PI * 2 : wrapGap;
		angleGaps.push(normGap);
	}

	return {
		rings: mergedRings,
		angles: mergedAngles,
		ringGaps,
		angleGaps,
		cx: center.x,
		cy: center.y,
	};
}

/**
 * Filter a PolarJunctionGrid to exclude the ring gap closest to the port.
 * The port faces the graph center, so the innermost ringGap is on the port face.
 */
export function filterPolarGridForPort(grid: PolarJunctionGrid, portR: number): PolarJunctionGrid {
	if (grid.ringGaps.length <= 0) return grid;

	// Find which ringGap is closest to the port radius
	let closestIdx = 0;
	let closestDist = Math.abs(grid.ringGaps[0] - portR);
	for (let i = 1; i < grid.ringGaps.length; i++) {
		const d = Math.abs(grid.ringGaps[i] - portR);
		if (d < closestDist) {
			closestDist = d;
			closestIdx = i;
		}
	}

	// Remove that ringGap
	const filtered = [...grid.ringGaps];
	filtered.splice(closestIdx, 1);
	return { ...grid, ringGaps: filtered };
}

/**
 * Route between two points within a polar group using the ring/angle grid.
 * Wires run along ringGap arcs and radial lines through angleGaps.
 *
 * Path: from -> (fromAngle, srcRingGap) -> arc to (toAngle, midRingGap) -> to
 */
export function routeViaPolarGrid(
	from: { x: number; y: number },
	to: { x: number; y: number },
	grid: PolarJunctionGrid,
): { x: number; y: number }[] {
	const { cx, cy, ringGaps, angleGaps } = grid;

	if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
		return [from, to];
	}

	const fromR = Math.sqrt((from.x - cx) ** 2 + (from.y - cy) ** 2);
	const toR = Math.sqrt((to.x - cx) ** 2 + (to.y - cy) ** 2);
	const fromA = Math.atan2(from.y - cy, from.x - cx);
	const toA = Math.atan2(to.y - cy, to.x - cx);

	const path: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
	const addPt = (x: number, y: number) => {
		const last = path[path.length - 1];
		if (Math.abs(x - last.x) > 1 || Math.abs(y - last.y) > 1) {
			path.push({ x, y });
		}
	};

	// Find the best ringGap to route through (between from and to radii)
	const midR = (fromR + toR) / 2;
	let gapR: number | null = null;
	if (ringGaps.length > 0) {
		gapR = ringGaps[0];
		let bestDist = Math.abs(gapR - midR);
		// Prefer gap between the two radii
		const loR = Math.min(fromR, toR),
			hiR = Math.max(fromR, toR);
		for (const r of ringGaps) {
			if (r > loR && r < hiR) {
				const d = Math.abs(r - midR);
				if (d < bestDist) {
					bestDist = d;
					gapR = r;
				}
			}
		}
		// If none between, use nearest
		if (!(gapR > loR && gapR < hiR)) {
			gapR = ringGaps[0];
			bestDist = Math.abs(gapR - midR);
			for (const r of ringGaps) {
				const d = Math.abs(r - midR);
				if (d < bestDist) {
					bestDist = d;
					gapR = r;
				}
			}
		}
	}

	// Find angleGap nearest to from's angle (for radial exit)
	const findAngleGap = (targetA: number): number | null => {
		if (angleGaps.length === 0) return null;
		let best = angleGaps[0];
		let bestD = angleDist(best, targetA);
		for (const a of angleGaps) {
			const d = angleDist(a, targetA);
			if (d < bestD) {
				bestD = d;
				best = a;
			}
		}
		return best;
	};

	const srcAngleGap = findAngleGap(fromA);
	const tgtAngleGap = findAngleGap(toA);

	if (gapR !== null && srcAngleGap !== null && tgtAngleGap !== null) {
		// Full polar routing:
		// 1. Radial from source to srcAngleGap at source's ring
		addPt(cx + fromR * Math.cos(srcAngleGap), cy + fromR * Math.sin(srcAngleGap));
		// 2. Move to ringGap along srcAngleGap
		addPt(cx + gapR * Math.cos(srcAngleGap), cy + gapR * Math.sin(srcAngleGap));
		// 3. Arc along ringGap from srcAngleGap to tgtAngleGap
		let dAngle = tgtAngleGap - srcAngleGap;
		if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
		if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
		const arcSteps = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
		for (let i = 1; i < arcSteps; i++) {
			const t = i / arcSteps;
			const a = srcAngleGap + dAngle * t;
			addPt(cx + gapR * Math.cos(a), cy + gapR * Math.sin(a));
		}
		// 4. Arrive at tgtAngleGap on ringGap
		addPt(cx + gapR * Math.cos(tgtAngleGap), cy + gapR * Math.sin(tgtAngleGap));
		// 5. Radial to target's ring at tgtAngleGap
		addPt(cx + toR * Math.cos(tgtAngleGap), cy + toR * Math.sin(tgtAngleGap));
	} else if (gapR !== null) {
		// No angle gaps: just radial out, arc, radial in
		addPt(cx + gapR * Math.cos(fromA), cy + gapR * Math.sin(fromA));
		let dAngle = toA - fromA;
		if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
		if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
		const arcSteps = Math.max(4, Math.ceil(Math.abs(dAngle) / (Math.PI / 12)));
		for (let i = 1; i < arcSteps; i++) {
			const t = i / arcSteps;
			const a = fromA + dAngle * t;
			addPt(cx + gapR * Math.cos(a), cy + gapR * Math.sin(a));
		}
		addPt(cx + gapR * Math.cos(toA), cy + gapR * Math.sin(toA));
	} else {
		// No ring gaps: direct radial (fallback)
		const midA = fromA + shortestAngleDelta(fromA, toA) / 2;
		const outerR = Math.max(fromR, toR) * 1.2;
		addPt(cx + outerR * Math.cos(midA), cy + outerR * Math.sin(midA));
	}

	addPt(to.x, to.y);
	return path;
}

// ---------------------------------------------------------------------------
// Group ports
// ---------------------------------------------------------------------------

/**
 * Compute 1 Port per group.
 * - Cartesian: placed at the center of the bbox face closest to graph center.
 * - Polar: placed at the point on the group boundary closest to graph center,
 *   with perpendicular tangent to the radial direction (arc-tangent).
 */
export function computeGroupPorts(
	groupKeys: Set<string>,
	centroids: Map<string, { x: number; y: number }>,
	radii: Map<string, number>,
	connections: Map<string, Set<string>>,
	coordinateSystem?: "cartesian" | "polar",
	polarCenter?: { x: number; y: number },
	resolvePos?: (ref: string | object) => Pos | undefined,
	nodeClusterMap?: Map<string, string>,
	/** Optional cache for bbox storage (side-effect: writes groupBBox and graphCenter) */
	cache?: { groupBBox: Map<string, GroupBBox | null>; graphCenter: { x: number; y: number } | null },
): Map<string, GroupPort> {
	const ports: Map<string, GroupPort> = new Map();
	const isPolar = coordinateSystem === "polar";

	// Compute graph center from all centroids
	const graphCenter = polarCenter ?? computeGraphCenter(centroids);
	if (cache) cache.graphCenter = graphCenter;

	// Estimate margin from node spacing (will be refined per-group if resolvePos available)
	const defaultMargin = 30;

	for (const gk of groupKeys) {
		const c = centroids.get(gk);
		if (!c) continue;

		if (isPolar) {
			// Polar port: place on group boundary in the direction toward graph center.
			// The perpendicular is the arc-tangent direction (perpendicular to radius).
			const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
			let dirX = graphCenter.x - c.x;
			let dirY = graphCenter.y - c.y;
			const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
			if (dirLen < 0.01) {
				dirX = 0;
				dirY = -1;
			} else {
				dirX /= dirLen;
				dirY /= dirLen;
			}
			// Perpendicular = tangent to the arc (90deg CCW from radial direction)
			const perpX = -dirY,
				perpY = dirX;
			ports.set(gk, { groupKey: gk, x: c.x + dirX * r, y: c.y + dirY * r, perpX, perpY });
			continue;
		}

		// Cartesian port: bbox face closest to graph center
		let bbox: GroupBBox | null = null;
		if (resolvePos && nodeClusterMap) {
			const positions: { x: number; y: number }[] = [];
			for (const [nid, g] of nodeClusterMap) {
				if (g !== gk) continue;
				const p = resolvePos(nid);
				if (p) positions.push({ x: p.x, y: p.y });
			}
			let margin = defaultMargin;
			if (positions.length >= 2) {
				let minDist = Infinity;
				for (let i = 0; i < Math.min(positions.length, 50); i++) {
					for (let j = i + 1; j < Math.min(positions.length, 50); j++) {
						const d = Math.sqrt(
							(positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2,
						);
						if (d > 1 && d < minDist) minDist = d;
					}
				}
				if (minDist < Infinity) margin = minDist * 0.5;
			}
			bbox = computeGroupBBox(gk, resolvePos, nodeClusterMap, margin);
			if (cache) cache.groupBBox.set(gk, bbox);
		}

		if (bbox) {
			const face = computePortFace(bbox, graphCenter);
			const pos = faceCenter(bbox, face);
			const { perpX, perpY } = facePerpendicular(face);
			ports.set(gk, { groupKey: gk, x: pos.x, y: pos.y, perpX, perpY });
		} else {
			// Fallback: same as polar (centroid + radius toward center)
			const r = radii.get(gk) ?? DEFAULT_CLUSTER_RADIUS;
			let dirX = graphCenter.x - c.x;
			let dirY = graphCenter.y - c.y;
			const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
			if (dirLen < 0.01) {
				dirX = 0;
				dirY = -1;
			} else {
				dirX /= dirLen;
				dirY /= dirLen;
			}
			const perpX = -dirY,
				perpY = dirX;
			ports.set(gk, { groupKey: gk, x: c.x + dirX * r, y: c.y + dirY * r, perpX, perpY });
		}
	}
	return ports;
}

// ---------------------------------------------------------------------------
// Trunk building
// ---------------------------------------------------------------------------

/** Group inter-group edges by color within each pair of groups. */
function collectPairData(
	edges: GraphEdge[],
	nodeClusterMap: Map<string, string>,
	relationColors: Map<string, string>,
	isDark: boolean,
): Map<string, { srcGroup: string; tgtGroup: string; byColor: Map<number, GraphEdge[]> }> {
	const pairData = new Map<
		string,
		{ srcGroup: string; tgtGroup: string; byColor: Map<number, GraphEdge[]> }
	>();
	for (const e of edges) {
		const sid = edgeSourceId(e);
		const tid = edgeTargetId(e);
		const srcGroup = nodeClusterMap.get(sid);
		const tgtGroup = nodeClusterMap.get(tid);
		if (!srcGroup || !tgtGroup || srcGroup === tgtGroup) continue;
		const [a, b] = srcGroup < tgtGroup ? [srcGroup, tgtGroup] : [tgtGroup, srcGroup];
		const pairKey = `${a}|${b}`;
		let pair = pairData.get(pairKey);
		if (!pair) {
			pair = { srcGroup: a, tgtGroup: b, byColor: new Map() };
			pairData.set(pairKey, pair);
		}
		const color = resolveEdgeColor(e, true, relationColors, isDark);
		let group = pair.byColor.get(color);
		if (!group) {
			group = [];
			pair.byColor.set(color, group);
		}
		group.push(e);
	}
	return pairData;
}

/** Compute junction point: port + 30% radius outward (away from centroid). */
function computeJunction(
	port: { x: number; y: number },
	centroid: { x: number; y: number } | undefined,
	radius: number,
): { x: number; y: number } {
	const jDist = radius * 0.3;
	const dx = port.x - (centroid?.x ?? port.x);
	const dy = port.y - (centroid?.y ?? port.y);
	const len = Math.sqrt(dx * dx + dy * dy);
	return len > 1
		? { x: port.x + (dx / len) * jDist, y: port.y + (dy / len) * jDist }
		: { x: port.x, y: port.y };
}

/** Select the appropriate middle-segment routing strategy for a trunk path. */
function buildTrunkMiddlePath(
	jctA: { x: number; y: number },
	jctB: { x: number; y: number },
	cfg: EdgeDrawConfig,
): { x: number; y: number }[] {
	const isPolar = cfg.coordinateSystem === "polar";
	const polarCenter = isPolar ? computePolarCenter(cfg) : undefined;
	if (isPolar && polarCenter) return buildPolarTrunkPath(jctA, jctB, polarCenter);
	const arrangement = cfg.clusterArrangement ?? "grid";
	if (arrangement === "horizontal" || arrangement === "timeline") return buildHorizontalTrunkPath(jctA, jctB);
	if (arrangement === "vertical") return buildVerticalTrunkPath(jctA, jctB);
	return buildManhattanPath(jctA, jctB);
}

/** Append a point to path if it differs from the last point by > 1px. */
function pushIfDistinct(path: { x: number; y: number }[], pt: { x: number; y: number }): void {
	const prev = path[path.length - 1];
	if (Math.abs(pt.x - prev.x) > 1 || Math.abs(pt.y - prev.y) > 1) {
		path.push(pt);
	}
}

/**
 * Group inter-group edges into Trunks (one per group pair).
 * Each trunk contains cables grouped by edge color.
 * Only pairs with 2+ edges become trunks (singletons stay as normal edges).
 */
export function buildTrunks(
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	allPorts?: Map<string, GroupPort>,
): { trunks: Trunk[]; cabledEdgeIds: Set<string> } {
	const trunks: Trunk[] = [];
	const cabledEdgeIds = new Set<string>();
	const { nodeClusterMap } = cfg;
	if (!nodeClusterMap) return { trunks, cabledEdgeIds };

	const pairData = collectPairData(edges, nodeClusterMap, cfg.relationColors, cfg.isDark);

	// Build connection map for Port computation (if allPorts not provided)
	const connections = new Map<string, Set<string>>();
	for (const [, pair] of pairData) {
		if (!connections.has(pair.srcGroup)) connections.set(pair.srcGroup, new Set());
		if (!connections.has(pair.tgtGroup)) connections.set(pair.tgtGroup, new Set());
		connections.get(pair.srcGroup)!.add(pair.tgtGroup);
		connections.get(pair.tgtGroup)!.add(pair.srcGroup);
	}

	const centroids = cfg.clusterCentroids;
	const _radii = cfg.clusterRadii;
	if (!centroids || !_radii) return { trunks, cabledEdgeIds };

	// Use provided allPorts or compute them
	let ports = allPorts;
	if (!ports) {
		const groupKeys = new Set(connections.keys());
		let _polarCenter: { x: number; y: number } | undefined;
		if (cfg.coordinateSystem === "polar" && centroids.size > 0) {
			let sx = 0,
				sy = 0;
			for (const c of centroids.values()) {
				sx += c.x;
				sy += c.y;
			}
			_polarCenter = { x: sx / centroids.size, y: sy / centroids.size };
		}
		ports = computeGroupPorts(
			groupKeys, centroids, _radii, connections,
			cfg.coordinateSystem, _polarCenter, resolvePos, cfg.nodeClusterMap ?? undefined,
		);
	}

	const trunkMinEdges = cfg.trunkMinEdges ?? 2;
	for (const [pairKey, pair] of pairData) {
		const cables: TrunkCable[] = [];
		const allEdges: GraphEdge[] = [];
		for (const [color, edgeList] of pair.byColor) {
			cables.push({ color, edges: edgeList });
			for (const e of edgeList) allEdges.push(e);
		}
		if (allEdges.length < trunkMinEdges) continue;

		const portA = ports.get(pair.srcGroup);
		const portB = ports.get(pair.tgtGroup);
		if (!portA || !portB) continue;

		const jctA = computeJunction(portA, centroids.get(pair.srcGroup), _radii.get(pair.srcGroup) ?? DEFAULT_CLUSTER_RADIUS);
		const jctB = computeJunction(portB, centroids.get(pair.tgtGroup), _radii.get(pair.tgtGroup) ?? DEFAULT_CLUSTER_RADIUS);

		const middle = buildTrunkMiddlePath(jctA, jctB, cfg);

		const path: { x: number; y: number }[] = [portA];
		pushIfDistinct(path, jctA);
		for (const p of middle) pushIfDistinct(path, p);
		pushIfDistinct(path, jctB);
		pushIfDistinct(path, portB);

		trunks.push({ pairKey, srcGroup: pair.srcGroup, tgtGroup: pair.tgtGroup, path, cables, allEdges });
		for (const e of allEdges) cabledEdgeIds.add(e.id);
	}

	return { trunks, cabledEdgeIds };
}

// ---------------------------------------------------------------------------
// Intra-group cable wiring
// ---------------------------------------------------------------------------

/**
 * Route a single source node's intra-group cable (branches + group port branch).
 * Extracted from the inner loop of buildIntraGroupCables Step 3.
 */
export function routeSingleIntraCable(
	sourceNodeId: string,
	edgeList: GraphEdge[],
	groupKey: string,
	centroid: { x: number; y: number },
	portForKey: GroupPort | null,
	perimInfo: GroupPerimInfo | null,
	isPolar: boolean,
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeClusterMap: Map<string, string>,
	groupExternalMap: Map<string, Map<string, GraphEdge[]>>,
	handledEdgeIds: Set<string>,
): IntraGroupCable | null {
	const srcPos = resolvePos(sourceNodeId);
	if (!srcPos) return null;

	const targetPositions = new Map<string, { x: number; y: number }>();
	const externalEdges = groupExternalMap.get(groupKey)?.get(sourceNodeId) ?? [];
	const connectsExternal = externalEdges.length > 0;

	for (const e of edgeList) {
		const tid = edgeTargetId(e);
		const tgtGroup = nodeClusterMap.get(tid);
		if (tgtGroup && tgtGroup !== groupKey) continue;
		if (targetPositions.has(tid)) continue;
		const tgtPos = resolvePos(e.target) ?? resolvePos(tid);
		if (!tgtPos) continue;
		targetPositions.set(tid, { x: tgtPos.x, y: tgtPos.y });
	}

	if (targetPositions.size === 0 && !connectsExternal) return null;

	const junction = { x: centroid.x, y: centroid.y };

	// -- Build branches: route via junction grid --
	// Use a filtered grid that excludes the port-face gap to avoid
	// branching wires on the same face as the entry port.
	const branches: IntraGroupCable["branches"] = [];

	// Prepare routing grid (cartesian or polar)
	const branchGrid = perimInfo ? filterGridForPortFace(perimInfo.grid, perimInfo.face) : null;
	// Polar: filter ringGap closest to port
	let branchPolarGrid: PolarJunctionGrid | null = null;
	if (isPolar && perimInfo?.polarGrid && portForKey) {
		const portR = Math.sqrt(
			(portForKey.x - perimInfo.polarGrid.cx) ** 2 + (portForKey.y - perimInfo.polarGrid.cy) ** 2,
		);
		branchPolarGrid = filterPolarGridForPort(perimInfo.polarGrid, portR);
	}

	// Choose routing function based on coordinate system
	const routeBranch = (src: { x: number; y: number }, tgt: { x: number; y: number }) => {
		if (branchPolarGrid && branchPolarGrid.ringGaps.length > 0) {
			return deduplicatePath(routeViaPolarGrid(src, tgt, branchPolarGrid));
		}
		if (branchGrid) {
			return deduplicatePath(routeViaJunctionGrid(src, tgt, branchGrid));
		}
		return [
			{ x: src.x, y: src.y },
			{ x: tgt.x, y: tgt.y },
		];
	};

	for (const e of edgeList) {
		const tid = edgeTargetId(e);
		const tgtPos = targetPositions.get(tid);
		if (!tgtPos) continue;

		let branch = branches.find((b) => b.nodePort.nodeId === tid);
		if (!branch) {
			const tgtPort: NodePort = { nodeId: tid, x: tgtPos.x, y: tgtPos.y };
			const path = routeBranch(srcPos, tgtPos);
			branch = { nodePort: tgtPort, path, edges: [] };
			branches.push(branch);
		}
		branch.edges.push(e);
		handledEdgeIds.add(e.id);
	}

	if (branches.length === 0 && !connectsExternal) return null;

	// Group port branch: route from source node to port.
	// Uses filtered grid so wire approaches port without branching on port face.
	let groupPortBranch: IntraGroupCable["groupPortBranch"] = null;
	if (connectsExternal && portForKey) {
		let path = routeBranch(srcPos, portForKey);
		path = deduplicatePath(path);
		groupPortBranch = { path, edges: [...externalEdges] };
	}

	return { groupKey, junction, branches, groupPortBranch };
}

/**
 * Route an external-only node (target of cross-group edges, no intra-group source edges).
 * Extracted from the inner loop of buildIntraGroupCables Step 4.
 */
export function routeExternalOnlyNode(
	nodeId: string,
	externalEdges: GraphEdge[],
	groupKey: string,
	centroid: { x: number; y: number },
	portForKey: GroupPort,
	perimInfo: GroupPerimInfo | null,
	isPolar: boolean,
	resolvePos: (ref: string | object) => Pos | undefined,
): IntraGroupCable | null {
	const nodePos = resolvePos(nodeId);
	if (!nodePos) return null;
	if (externalEdges.length === 0) return null;

	const junction = { x: centroid.x, y: centroid.y };

	let path: { x: number; y: number }[];
	if (isPolar && perimInfo?.polarGrid) {
		// Polar: route through filtered polar grid
		const portR = Math.sqrt(
			(portForKey.x - perimInfo.polarGrid.cx) ** 2 + (portForKey.y - perimInfo.polarGrid.cy) ** 2,
		);
		const filteredPolar = filterPolarGridForPort(perimInfo.polarGrid, portR);
		path =
			filteredPolar.ringGaps.length > 0
				? deduplicatePath(routeViaPolarGrid(nodePos, portForKey, filteredPolar))
				: [
						{ x: nodePos.x, y: nodePos.y },
						{ x: portForKey.x, y: portForKey.y },
					];
	} else if (perimInfo) {
		// Cartesian: route through filtered junction grid
		const filteredGrid = filterGridForPortFace(perimInfo.grid, perimInfo.face);
		path = deduplicatePath(routeViaJunctionGrid(nodePos, portForKey, filteredGrid));
	} else {
		path = [
			{ x: nodePos.x, y: nodePos.y },
			{ x: portForKey.x, y: portForKey.y },
		];
	}

	const groupPortBranch: IntraGroupCable["groupPortBranch"] = { path, edges: [...externalEdges] };
	return { groupKey, junction, branches: [], groupPortBranch };
}

/** Append an edge to a nested Map<string, Map<string, GraphEdge[]>>. */
function appendToNestedMap(
	map: Map<string, Map<string, GraphEdge[]>>,
	groupKey: string,
	nodeId: string,
	edge: GraphEdge,
): void {
	let inner = map.get(groupKey);
	if (!inner) {
		inner = new Map();
		map.set(groupKey, inner);
	}
	let list = inner.get(nodeId);
	if (!list) {
		list = [];
		inner.set(nodeId, list);
	}
	list.push(edge);
}

/** Classify edges into intra-group (same group) and external (cross-group) maps. */
function classifyIntraExternalEdges(
	edges: GraphEdge[],
	nodeClusterMap: Map<string, string>,
): {
	groupSourceMap: Map<string, Map<string, GraphEdge[]>>;
	groupExternalMap: Map<string, Map<string, GraphEdge[]>>;
} {
	const groupSourceMap = new Map<string, Map<string, GraphEdge[]>>();
	const groupExternalMap = new Map<string, Map<string, GraphEdge[]>>();
	for (const e of edges) {
		const sid = edgeSourceId(e);
		const tid = edgeTargetId(e);
		const srcGroup = nodeClusterMap.get(sid);
		const tgtGroup = nodeClusterMap.get(tid);
		if (!srcGroup || !tgtGroup) continue;
		if (srcGroup === tgtGroup) {
			appendToNestedMap(groupSourceMap, srcGroup, sid, e);
		} else {
			appendToNestedMap(groupExternalMap, srcGroup, sid, e);
			appendToNestedMap(groupExternalMap, tgtGroup, tid, e);
		}
	}
	return { groupSourceMap, groupExternalMap };
}

/** Estimate margin for group bbox from nearest-neighbor distance. */
function estimateBBoxMargin(
	groupKey: string,
	nodeClusterMap: Map<string, string>,
	resolvePos: (ref: string | object) => Pos | undefined,
): number {
	const positions: { x: number; y: number }[] = [];
	for (const [nid, g] of nodeClusterMap) {
		if (g !== groupKey) continue;
		const p = resolvePos(nid);
		if (p) positions.push({ x: p.x, y: p.y });
	}
	if (positions.length < 2) return 30;
	let minDist = Infinity;
	const cap = Math.min(positions.length, 50);
	for (let i = 0; i < cap; i++) {
		for (let j = i + 1; j < cap; j++) {
			const d = Math.sqrt((positions[i].x - positions[j].x) ** 2 + (positions[i].y - positions[j].y) ** 2);
			if (d > 1 && d < minDist) minDist = d;
		}
	}
	return minDist < Infinity ? minDist * 0.5 : 30;
}

/** Compute perimeter info (bbox, face, port, grid) for a single group. */
function computeGroupPerimInfo(
	groupKey: string,
	graphCenter: { x: number; y: number },
	isPolar: boolean,
	clusterCentroids: Map<string, { x: number; y: number }>,
	nodeClusterMap: Map<string, string>,
	resolvePos: (ref: string | object) => Pos | undefined,
	cache?: { groupBBox: Map<string, GroupBBox | null>; graphCenter: { x: number; y: number } | null },
): GroupPerimInfo | null {
	let bbox = cache?.groupBBox.get(groupKey) ?? null;
	if (!bbox) {
		const margin = estimateBBoxMargin(groupKey, nodeClusterMap, resolvePos);
		bbox = computeGroupBBox(groupKey, resolvePos, nodeClusterMap, margin);
		if (cache) cache.groupBBox.set(groupKey, bbox);
	}
	if (!bbox) return null;

	const face = computePortFace(bbox, graphCenter);
	const port = faceCenter(bbox, face);
	const perimeterPath = buildPerimeterPath(bbox, face, port);
	const grid = computeJunctionGrid(groupKey, resolvePos, nodeClusterMap);

	let polarGrid: PolarJunctionGrid | undefined;
	if (isPolar) {
		const centroid = clusterCentroids.get(groupKey);
		if (centroid) polarGrid = computePolarJunctionGrid(groupKey, resolvePos, nodeClusterMap, centroid);
	}

	return { bbox, face, port, perimeterPath, grid, polarGrid };
}

/**
 * Build intra-group cables using perimeter routing.
 *
 * Each group has a single port (on the bbox face closest to graph center).
 * Wires enter at the port and travel counter-clockwise around the group's
 * bounding box perimeter. When a wire reaches the row/column of its target
 * node, it branches inward via an L-shaped Manhattan path.
 *
 * External (cross-group) edges also route from the node to the port via
 * the perimeter path.
 */
export function buildIntraGroupCables(
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
	groupPorts: Map<string, GroupPort>,
	/** Optional cache for bbox storage */
	cache?: { groupBBox: Map<string, GroupBBox | null>; graphCenter: { x: number; y: number } | null },
): { cables: IntraGroupCable[]; handledEdgeIds: Set<string> } {
	const cables: IntraGroupCable[] = [];
	const handledEdgeIds = new Set<string>();
	const { nodeClusterMap, clusterCentroids } = cfg;
	if (!nodeClusterMap || !clusterCentroids) return { cables, handledEdgeIds };

	// Step 1: Classify edges into intra-group and external maps
	const { groupSourceMap, groupExternalMap } = classifyIntraExternalEdges(edges, nodeClusterMap);

	// Step 2: Pre-compute group bboxes, perimeter paths, and junction grids
	const isPolar = cfg.coordinateSystem === "polar";
	const groupPerimeters = new Map<string, GroupPerimInfo>();
	const graphCenter = cache?.graphCenter ?? computeGraphCenter(clusterCentroids);

	const allGroupKeys = new Set<string>();
	for (const gk of groupSourceMap.keys()) allGroupKeys.add(gk);
	for (const gk of groupExternalMap.keys()) allGroupKeys.add(gk);

	for (const groupKey of allGroupKeys) {
		const info = computeGroupPerimInfo(groupKey, graphCenter, isPolar, clusterCentroids, nodeClusterMap, resolvePos, cache);
		if (info) groupPerimeters.set(groupKey, info);
	}

	// Step 3: Build cables with perimeter routing
	for (const [groupKey, sourceMap] of groupSourceMap) {
		const centroid = clusterCentroids.get(groupKey);
		if (!centroid) continue;
		const portForKey = groupPorts.get(groupKey);
		const perimInfo = groupPerimeters.get(groupKey);

		for (const [sourceNodeId, edgeList] of sourceMap) {
			const cable = routeSingleIntraCable(
				sourceNodeId, edgeList, groupKey, centroid,
				portForKey ?? null, perimInfo ?? null, isPolar,
				resolvePos, nodeClusterMap, groupExternalMap, handledEdgeIds,
			);
			if (cable) cables.push(cable);
		}
	}

	// Step 4: Handle nodes that are only targets of cross-group edges
	for (const [groupKey, extNodeMap] of groupExternalMap) {
		const centroid = clusterCentroids.get(groupKey);
		if (!centroid) continue;
		const portForKey = groupPorts.get(groupKey);
		if (!portForKey) continue;

		const sourceMap = groupSourceMap.get(groupKey);
		const perimInfo = groupPerimeters.get(groupKey);

		for (const [nodeId, externalEdges] of extNodeMap) {
			if (sourceMap?.has(nodeId)) continue;
			const cable = routeExternalOnlyNode(
				nodeId, externalEdges, groupKey, centroid,
				portForKey, perimInfo ?? null, isPolar, resolvePos,
			);
			if (cable) cables.push(cable);
		}
	}

	return { cables, handledEdgeIds };
}

// ---------------------------------------------------------------------------
// Wire alpha / thickness helpers
// ---------------------------------------------------------------------------

/**
 * Compute a degree-based alpha multiplier for cable wires.
 * Mirrors the fadeByDegree logic in resolveEdgeStyle for consistency.
 */
export function cableFadeByDegree(
	edges: GraphEdge[],
	cfg: Pick<EdgeDrawConfig, "fadeByDegree" | "maxDegree" | "degrees">,
): number {
	if (!cfg.fadeByDegree || cfg.maxDegree <= 0) return 1;
	let minDeg = Infinity;
	for (const e of edges) {
		const sd = cfg.degrees.get(edgeSourceId(e)) ?? 0;
		const td = cfg.degrees.get(edgeTargetId(e)) ?? 0;
		const d = Math.min(sd, td);
		if (d < minDeg) minDeg = d;
	}
	if (minDeg === Infinity) return 1;
	const t = Math.sqrt(minDeg / cfg.maxDegree);
	return FADE_BY_DEGREE_MIN_ALPHA + (1 - FADE_BY_DEGREE_MIN_ALPHA) * t;
}

/**
 * Compute weight-based thickness bonus for cable wires.
 * Uses the max pair count among the edges in the group.
 */
export function cableWeightThickness(edges: GraphEdge[], cfg: Pick<EdgeDrawConfig, "edgeWeightThickness">): number {
	if (!cfg.edgeWeightThickness || edges.length <= 1) return 0;
	// Count same source-target pairs
	const pairs = new Map<string, number>();
	for (const e of edges) {
		const k = [edgeSourceId(e), edgeTargetId(e)].sort().join(":");
		incCounter(pairs, k);
	}
	let maxW = 1;
	for (const w of pairs.values()) {
		if (w > maxW) maxW = w;
	}
	return maxW > 1 ? Math.log2(maxW) * WEIGHT_THICKNESS_FACTOR : 0;
}

// ---------------------------------------------------------------------------
// Port color lanes
// ---------------------------------------------------------------------------

/**
 * Build a shared color->lane mapping for each group port (1 port per group).
 * Collects colors from groupPortBranch edges per group.
 * Key: groupKey (not "groupKey|dir" since there is only 1 port).
 */
export function buildPortColorLanes(
	trunks: Trunk[],
	cables: { groupKey: string; groupPortBranch: { edges: GraphEdge[] } | null }[],
	cfg: Pick<EdgeDrawConfig, "colorEdgesByRelation" | "relationColors" | "isDark">,
	groupPorts: Map<string, GroupPort>,
): PortColorLanes {
	// Key: groupKey
	const portColors = new Map<string, Set<number>>();

	const ensure = (key: string): Set<number> => {
		let s = portColors.get(key);
		if (!s) {
			s = new Set();
			portColors.set(key, s);
		}
		return s;
	};

	// Collect colors from groupPortBranch edges
	for (const cable of cables) {
		const gpb = cable.groupPortBranch;
		if (!gpb || gpb.edges.length === 0) continue;
		const s = ensure(cable.groupKey);
		for (const e of gpb.edges) {
			const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
			s.add(c);
		}
	}

	// Build PortLaneInfo with fixed endpoint coordinates per color
	const result: PortColorLanes = new Map();
	for (const [gk, colorSet] of portColors) {
		const port = groupPorts.get(gk);
		if (!port) continue;
		const colors = [...colorSet].sort((a, b) => a - b);
		result.set(gk, {
			colors,
			portX: port.x,
			portY: port.y,
			perpX: port.perpX,
			perpY: port.perpY,
		});
	}
	return result;
}

/** Compute the fixed endpoint coordinate for a given color at a group port. */
export function getPortLaneEndpoint(
	info: PortLaneInfo,
	color: number,
	laneSpacing: number,
): { x: number; y: number } | null {
	const idx = info.colors.indexOf(color);
	if (idx < 0) return null;
	const nUnique = info.colors.length;
	const off = nUnique > 1 ? (idx - (nUnique - 1) / 2) * laneSpacing : 0;
	return {
		x: info.portX + info.perpX * off,
		y: info.portY + info.perpY * off,
	};
}
