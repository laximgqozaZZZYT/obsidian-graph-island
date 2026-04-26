/**
 * Cable-tray drawing primitives.  Extracted from EdgeRenderer to keep that
 * module within its god-object line budget.
 *
 * All functions here are stateless: they take a CanvasGraphics, the cable /
 * trunk data prepared elsewhere, and the EdgeDrawConfig — no module-level
 * cache, no PixiJS state.  Layout / preparation lives in CableTrayRenderer;
 * orchestration (caching, dirty flags, edge filtering) stays in EdgeRenderer.
 */

import type { CanvasGraphics } from "../canvas2d";
import type { GraphEdge } from "../../types";
import { edgeSourceId, edgeTargetId } from "../../utils/graph-helpers";
import { FADE_BY_DEGREE_MIN_ALPHA } from "../../constants";
import {
	type IntraGroupCable,
	type PortColorLanes,
	type Trunk,
	CABLE_LANE_SPACING,
	TRUNK_CONDUIT_ALPHA,
	WIRE_BASE_ALPHA,
	STUB_WIRE_SPACING,
	TRUNK_SCREEN_WIDTH,
	CABLE_SCREEN_WIDTH,
	WIRE_SCREEN_WIDTH,
	zoomFadeAlpha as _zoomFadeAlpha,
	cableFadeByDegree,
	cableWeightThickness,
	getPortLaneEndpoint,
} from "../CableTrayRenderer";
import { resolveEdgeColor, type EdgeDrawConfig } from "../EdgeRenderer";

/**
 * Draw a smooth path with quadratic curves at direction changes.
 * Returns without drawing if path has fewer than 2 points.
 */
function drawSmoothPath(
	g: CanvasGraphics,
	path: { x: number; y: number }[],
	width: number,
	color: number,
	alpha: number,
	native = true,
): void {
	if (path.length < 2) return;
	g.lineStyle({ width, color, alpha, native });
	g.moveTo(path[0].x, path[0].y);
	for (let i = 1; i < path.length; i++) {
		const prev = path[i - 1];
		const cur = path[i];
		const next = i < path.length - 1 ? path[i + 1] : null;
		if (next) {
			const dx1 = cur.x - prev.x,
				dy1 = cur.y - prev.y;
			const dx2 = next.x - cur.x,
				dy2 = next.y - cur.y;
			const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
			const dot = Math.abs(dx1 * dx2 + dy1 * dy2);
			if (cross > 0.1 * (dot + 1)) {
				const mx = (cur.x + next.x) / 2,
					my = (cur.y + next.y) / 2;
				g.quadraticCurveTo(cur.x, cur.y, mx, my);
			} else {
				g.lineTo(cur.x, cur.y);
			}
		} else {
			g.lineTo(cur.x, cur.y);
		}
	}
}

/**
 * Draw a single cable's branch wires (node-to-node within group).
 * Deduplicates by color so multiple edges of the same color draw as one wire.
 */
function drawSingleIntraCableBranches(
	g: CanvasGraphics,
	cable: IntraGroupCable,
	cfg: EdgeDrawConfig,
	densityScale: number,
	filterHighlight: "normal" | "bright" | "dim" | null,
	getBranchHighlight: (edges: GraphEdge[]) => "normal" | "bright" | "dim",
	zoomFade = 1,
): void {
	for (const branch of cable.branches) {
		const colorMap = new Map<number, GraphEdge[]>();
		for (const e of branch.edges) {
			const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
			const ex = colorMap.get(c);
			if (ex) ex.push(e);
			else colorMap.set(c, [e]);
		}

		const nColors = colorMap.size;
		const p0 = branch.path[0],
			pN = branch.path[branch.path.length - 1];
		const tdx = pN.x - p0.x,
			tdy = pN.y - p0.y;
		const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
		const perpX = tlen > 0 ? -tdy / tlen : 0;
		const perpY = tlen > 0 ? tdx / tlen : 1;

		let ci = 0;
		for (const [color, edges] of colorMap) {
			const highlight = getBranchHighlight(edges);
			// If filtering, only draw wires matching the filter
			if (filterHighlight !== null && highlight !== filterHighlight) {
				ci++;
				continue;
			}

			let wireAlpha = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
			if (highlight === "bright") wireAlpha = cfg.highlightEdgeAlpha ?? 1.0;
			else if (highlight === "dim") wireAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;

			// Apply degree-based fade to cable wires (mirrors resolveEdgeStyle)
			wireAlpha *= cableFadeByDegree(edges, cfg);

			const off = nColors > 1 ? (ci - (nColors - 1) / 2) * STUB_WIRE_SPACING : 0;
			const wirePath =
				off === 0 ? branch.path : branch.path.map((p) => ({ x: p.x + perpX * off, y: p.y + perpY * off }));

			const baseAlpha =
				highlight === "bright"
					? wireAlpha
					: Math.max(wireAlpha * densityScale, highlight === "dim" ? 0.05 : 0.1);
			const finalAlpha = baseAlpha * zoomFade;
			const wireWidth = (cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH) + cableWeightThickness(edges, cfg);
			drawSmoothPath(g, wirePath, wireWidth, color, finalAlpha);
			ci++;
		}
	}
}

/**
 * Draw a single cable's group-port-branch wires.
 * Handles both highlighting and normal modes.
 */
function drawSingleIntraCableGpb(
	g: CanvasGraphics,
	cable: IntraGroupCable,
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes: PortColorLanes | undefined,
	filterHighlight: "dim" | "bright" | null,
	getBranchHighlight: (edges: GraphEdge[]) => "normal" | "bright" | "dim",
	zoomFade = 1,
): void {
	const gpb = cable.groupPortBranch;
	if (!gpb || gpb.edges.length === 0) return;

	const gpColorMap = new Map<number, GraphEdge[]>();
	for (const e of gpb.edges) {
		const c = resolveEdgeColor(e, cfg.colorEdgesByRelation, cfg.relationColors, cfg.isDark);
		const ex = gpColorMap.get(c);
		if (ex) ex.push(e);
		else gpColorMap.set(c, [e]);
	}

	for (const [color, edges] of gpColorMap) {
		// Build wire path with port endpoint shifted to lane position
		const wirePath = gpb.path.map((p) => ({ x: p.x, y: p.y }));
		if (portColorLanes && wirePath.length >= 2) {
			const laneInfo = portColorLanes.get(cable.groupKey);
			if (laneInfo) {
				const ep = getPortLaneEndpoint(laneInfo, color, CABLE_LANE_SPACING);
				if (ep) wirePath[wirePath.length - 1] = ep;
			}
		}

		const fadeMul = cableFadeByDegree(edges, cfg);
		const wireWidth = (cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH) + cableWeightThickness(edges, cfg);
		const baseA = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;

		if (filterHighlight !== null) {
			// Highlighting mode — filter by highlight state
			const gpHighlight = getBranchHighlight(edges);
			if (gpHighlight !== filterHighlight) continue;

			const wireAlpha =
				(gpHighlight === "bright"
					? (cfg.highlightEdgeAlpha ?? 1.0)
					: (cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA)) * fadeMul;

			const gpFinalAlpha =
				(gpHighlight === "bright" ? wireAlpha : Math.max(wireAlpha * densityScale, 0.05)) * zoomFade;
			drawSmoothPath(g, wirePath, wireWidth, color, gpFinalAlpha);
		} else {
			// Normal mode — draw all at base alpha
			const gpFinalAlpha = Math.max(baseA * fadeMul * densityScale, 0.1) * zoomFade;
			drawSmoothPath(g, wirePath, wireWidth, color, gpFinalAlpha);
		}
	}
}

/**
 * Draw intra-group cables in 2 passes: conduits then wires.
 */
export function drawIntraGroupCables(
	g: CanvasGraphics,
	cables: IntraGroupCable[],
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes?: PortColorLanes,
): void {
	if (cables.length === 0) return;

	// Zoom-out fade: reduce intra-group cable alpha at extreme zoom.
	// Trunks (inter-group) are NOT affected — only intra-group wires fade.
	const ws = cfg.worldScale ?? 1;
	const zoomFade = _zoomFadeAlpha(ws);
	if (zoomFade < 0.02) return; // Fully faded: skip drawing entirely

	// Highlight helper: an edge is "bright" only when the HOVERED node itself
	// is one of its endpoints (not just any highlight-set member).
	const hovId = cfg.highlightedNodeId;
	const getBranchHighlight = (branchEdges: GraphEdge[]): "normal" | "bright" | "dim" => {
		if (!hovId) return "normal";
		for (const e of branchEdges) {
			const sid = edgeSourceId(e);
			const tid = edgeTargetId(e);
			// Both endpoints must be in highlight set for the edge to be "bright".
			// This prevents trunk/branch lines unrelated to the hovered node from
			// being highlighted just because they share a group port.
			if (cfg.highlightSet.has(sid) && cfg.highlightSet.has(tid)) return "bright";
		}
		return "dim";
	};

	// Internal groupPortBranch wires and external trunk wires both terminate
	// at the group port coordinates, so they visually connect without markers.

	// No conduit layer — wires are drawn directly inside trunks.

	// PASS 1: Intra-group branch wires (node-to-node within group)
	// Within each branch (same source→target), deduplicate by color so that
	// multiple edges of the same color (e.g., link + semantic) draw as one wire.
	// When highlighting, draw in 2 sub-passes: dim first, then bright on top.
	const _drawBranchWires = (filterHighlight: "normal" | "bright" | "dim" | null) => {
		for (const cable of cables) {
			drawSingleIntraCableBranches(g, cable, cfg, densityScale, filterHighlight, getBranchHighlight, zoomFade);
		}
	};

	if (cfg.highlightedNodeId) {
		// During hover: draw dim wires first (faint background), then bright on top.
		_drawBranchWires("dim");
		_drawBranchWires("bright");
	} else {
		_drawBranchWires(null);
	}

	// PASS 2: Single group port branch wires (1 port per group).
	// When highlighting: draw per-cable for accurate path-specific highlighting.
	// When idle: draw all wires at normal alpha.
	if (cfg.highlightedNodeId) {
		// Per-cable drawing with 2 sub-passes: dim first, bright on top.
		const _drawGpbWires = (filterHL: "dim" | "bright") => {
			for (const cable of cables) {
				drawSingleIntraCableGpb(
					g,
					cable,
					cfg,
					densityScale,
					portColorLanes,
					filterHL,
					getBranchHighlight,
					zoomFade,
				);
			}
		};
		_drawGpbWires("dim");
		_drawGpbWires("bright");
	} else {
		for (const cable of cables) {
			drawSingleIntraCableGpb(g, cable, cfg, densityScale, portColorLanes, null, getBranchHighlight, zoomFade);
		}
	}
}

/** Split wire edges into bright/dim sets based on highlight membership. */
function splitHighlightEdges(
	wireEdges: GraphEdge[],
	highlightSet: Set<string>,
): { bright: GraphEdge[]; dim: GraphEdge[] } {
	const bright: GraphEdge[] = [];
	const dim: GraphEdge[] = [];
	for (const e of wireEdges) {
		if (highlightSet.has(edgeSourceId(e)) || highlightSet.has(edgeTargetId(e))) {
			bright.push(e);
		} else {
			dim.push(e);
		}
	}
	return { bright, dim };
}

/** Draw highlight-split wire: bright/dim passes for highlighted trunk wires. */
function drawHighlightedWire(
	g: CanvasGraphics,
	wirePath: { x: number; y: number }[],
	wireWidth: number,
	color: number,
	wireEdges: GraphEdge[],
	cfg: EdgeDrawConfig,
	fadeMul: number,
	densityScale: number,
	filterHighlight: "bright" | "dim" | "normal" | null,
): void {
	const { bright, dim } = splitHighlightEdges(wireEdges, cfg.highlightSet);
	if (dim.length > 0 && (filterHighlight === null || filterHighlight === "dim")) {
		const dimAlpha = Math.max(
			(cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA) * fadeMul * densityScale,
			0.05,
		);
		drawSmoothPath(g, wirePath, wireWidth, color, dimAlpha);
	}
	if (bright.length > 0 && (filterHighlight === null || filterHighlight === "bright")) {
		const brightAlpha = (cfg.highlightEdgeAlpha ?? 1.0) * fadeMul;
		drawSmoothPath(g, wirePath, wireWidth, color, brightAlpha);
	}
}

/**
 * Draw a single trunk's wires with lane offsets and port coupling.
 * Merges same-colored cables into a single wire lane.
 */
function drawSingleTrunk(
	g: CanvasGraphics,
	trunk: Trunk,
	cfg: EdgeDrawConfig,
	densityScale: number,
	laneSpacing: number,
	portColorLanes: PortColorLanes | undefined,
	filterHighlight: "bright" | "dim" | "normal" | null,
): void {
	const p0 = trunk.path[0],
		pN = trunk.path[trunk.path.length - 1];
	const tdx = pN.x - p0.x,
		tdy = pN.y - p0.y;
	const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
	const perpX = tlen > 0 ? -tdy / tlen : 0;
	const perpY = tlen > 0 ? tdx / tlen : 1;

	const colorMap = new Map<number, GraphEdge[]>();
	for (const cable of trunk.cables) {
		const existing = colorMap.get(cable.color);
		if (existing) {
			existing.push(...cable.edges);
		} else {
			colorMap.set(cable.color, [...cable.edges]);
		}
	}

	const uniqueColors = [...colorMap.keys()];
	const nUnique = uniqueColors.length;

	const srcLane = portColorLanes?.get(trunk.srcGroup);
	const tgtLane = portColorLanes?.get(trunk.tgtGroup);

	const neutralColor = cfg.isDark ? 0x888888 : 0x666666;
	const useRelColor = cfg.colorEdgesByRelation;
	const hcMul = cfg.highContrast ? 2 : 1;

	for (let ci = 0; ci < nUnique; ci++) {
		const rawColor = uniqueColors[ci];
		const color = useRelColor ? rawColor : neutralColor;
		const wireEdges = colorMap.get(rawColor)!;

		const off = (ci - (nUnique - 1) / 2) * laneSpacing;
		const ox = perpX * off,
			oy = perpY * off;

		const _buildTrunkWirePath = (): { x: number; y: number }[] => {
			const wp = trunk.path.map((p) => ({ x: p.x + ox, y: p.y + oy }));
			const srcEp = srcLane ? getPortLaneEndpoint(srcLane, color, laneSpacing) : null;
			const tgtEp = tgtLane ? getPortLaneEndpoint(tgtLane, color, laneSpacing) : null;
			if (srcEp) wp[0] = srcEp;
			if (tgtEp) wp[wp.length - 1] = tgtEp;
			return wp;
		};

		const fadeMul = cableFadeByDegree(wireEdges, cfg);
		const baseWireW = cfg.cableFanWidth ?? WIRE_SCREEN_WIDTH;
		const baseWireA = cfg.cableFanAlpha ?? WIRE_BASE_ALPHA;
		const ws = cfg.worldScale ?? 1;
		const zoomThicken = ws < 0.5 ? Math.min(2.5, 1 / (ws * 2)) : 1;
		const wireWidth = (baseWireW + cableWeightThickness(wireEdges, cfg)) * zoomThicken * hcMul;

		if (cfg.highlightedNodeId) {
			drawHighlightedWire(
				g,
				_buildTrunkWirePath(),
				wireWidth,
				color,
				wireEdges,
				cfg,
				fadeMul,
				densityScale,
				filterHighlight,
			);
		} else {
			if (filterHighlight !== null && filterHighlight !== "normal") continue;
			const wireAlpha = Math.max(baseWireA * fadeMul * densityScale, 0.35);
			drawSmoothPath(g, _buildTrunkWirePath(), wireWidth, color, wireAlpha);
		}
	}
}

/**
 * Draw trunks in 3 passes: conduit background, cable conduits, then wires.
 * Uses internal drawSmoothPath for all rendering.
 */
export function drawTrunks(
	g: CanvasGraphics,
	trunks: Trunk[],
	cfg: EdgeDrawConfig,
	densityScale: number,
	portColorLanes?: PortColorLanes,
	onlyHighlight?: "bright",
): void {
	if (trunks.length === 0) return;

	// All layers use native=true (screen pixels) for consistent visibility at any zoom.
	// Layer widths: Trunk(12px) > Cable(6px) > Wire(1.5px) — clearly distinguishable.

	// Highlight helper
	const getTrunkHighlight = (trunk: Trunk): "normal" | "bright" | "dim" => {
		if (!cfg.highlightedNodeId) return "normal";
		for (const cable of trunk.cables) {
			for (const e of cable.edges) {
				if (cfg.highlightSet.has(edgeSourceId(e)) || cfg.highlightSet.has(edgeTargetId(e))) return "bright";
			}
		}
		return "dim";
	};

	// Configurable cable rendering parameters (from panel sliders, fallback to constants)
	const cfgTrunkWidth = cfg.cableTrunkWidth ?? TRUNK_SCREEN_WIDTH;
	const cfgTrunkAlpha = cfg.cableTrunkAlpha ?? TRUNK_CONDUIT_ALPHA;
	const cfgLaneSpacing = cfg.cableSpacing ?? CABLE_LANE_SPACING;
	const laneSpacing = cfgLaneSpacing;

	// PASS 1: Trunk conduits — width adapts to cable count so all lanes fit inside.
	// Alpha scales inversely with trunk count to prevent overdrawn white bands
	// where many trunks overlap (e.g., through dense node rows).
	const trunkCountAlpha = trunks.length <= 5 ? 1.0 : trunks.length <= 20 ? 0.5 : trunks.length <= 100 ? 0.25 : 0.12;
	for (const trunk of trunks) {
		// Use unique color count for width (merged same-color cables share a lane)
		const trunkColorSet = new Set<number>();
		for (const c of trunk.cables) trunkColorSet.add(c.color);
		const trunkWidth = Math.max(trunkColorSet.size * laneSpacing + CABLE_SCREEN_WIDTH, cfgTrunkWidth);
		if (cfgTrunkAlpha > 0) {
			const highlight = getTrunkHighlight(trunk);
			const trunkAlpha = highlight === "dim" ? 0.02 : highlight === "bright" ? 0.2 : cfgTrunkAlpha;
			// Use dominant cable color instead of hardcoded gray for trunk conduit
			let dominantColor = 0x888888;
			let maxEdgeCount = 0;
			for (const c of trunk.cables) {
				if (c.edges.length > maxEdgeCount) {
					maxEdgeCount = c.edges.length;
					dominantColor = c.color;
				}
			}
			drawSmoothPath(g, trunk.path, trunkWidth, dominantColor, trunkAlpha * densityScale * trunkCountAlpha);
		}
	}

	// PASS 2: Wires — colored, directly inside trunk conduit (no cable sub-conduits).
	// Merge same-colored cables into a single wire lane to avoid duplicates.
	// When highlighting, draw dim first then bright on top for z-order.
	const _drawTrunkWires = (filterHighlight: "bright" | "dim" | "normal" | null) => {
		for (const trunk of trunks) {
			drawSingleTrunk(g, trunk, cfg, densityScale, laneSpacing, portColorLanes, filterHighlight);
		}
	};

	if (onlyHighlight === "bright") {
		// Called as final pass — only draw bright wires
		_drawTrunkWires("bright");
	} else if (cfg.highlightedNodeId) {
		// During hover: draw dim wires first (faint background), then bright on top
		_drawTrunkWires("dim");
		_drawTrunkWires("bright");
	} else {
		_drawTrunkWires(null);
	}
}
