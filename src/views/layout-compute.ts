/**
 * Static layout computation — extracted from GraphViewContainer to reduce god-object size.
 *
 * computeStaticLayout is a pure-ish dispatch function that calls the appropriate
 * layout algorithm and returns structured results.
 */

import type { App, TFile } from "obsidian";
import type { GraphData, GraphNode, LayoutType, ShellInfo } from "../types";
import type { SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import type { TimelineBarInfo } from "../layouts/cluster-force";
import { applyConcentricLayout } from "../layouts/concentric";
import { applyArcLayout } from "../layouts/arc";
import { applySunburstLayout } from "../layouts/sunburst";
import { buildSunburstData } from "../parsers/metadata-parser";
import { applyTimelineLayout } from "../layouts/timeline";
import {
	LAYOUT_CONCENTRIC,
	LAYOUT_ARC,
	LAYOUT_SUNBURST,
	LAYOUT_TIMELINE,
} from "../constants";
// i18n not needed here — error messages are handled by callers

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured result from computeStaticLayout. */
export interface StaticLayoutResult {
	data: GraphData;
	shells: ShellInfo[];
	nodeShellIndex: Map<string, number>;
	/** Sunburst arcs (only for LAYOUT_SUNBURST) */
	sunburstArcs?: LayoutSunburstArc[];
	/** Sunburst center (only for LAYOUT_SUNBURST) */
	sunburstCenter?: { x: number; y: number };
	/** Timeline metadata (only for LAYOUT_TIMELINE) */
	timelineBars?: TimelineBarInfo[];
	timelineSteps?: string[];
	timelineStepWidth?: number;
	timelineLanes?: number;
	timelineWorkGroups?: { name: string; minY: number; maxY: number }[];
}

/** Configuration for computeStaticLayout. */
export interface StaticLayoutConfig {
	layout: LayoutType;
	cx: number;
	cy: number;
	W: number;
	H: number;
	/** Sort comparator for node ordering (undefined = no custom sort) */
	sortComparator: ((a: GraphNode, b: GraphNode) => number) | undefined;
	/** Node spacing map */
	nodeSpacingMap: Map<string, number>;
	/** Obsidian App reference (for sunburst + timeline) */
	app: App;
	/** Group field for sunburst */
	groupField: string;
	/** Concentric layout options */
	concentricMinRadius?: number;
	concentricRadiusStep?: number;
	/** Timeline options */
	timelineKey?: string;
	timelineEndKey?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Compute a static layout (concentric, arc, sunburst, timeline) and return the result.
 * Extracted from GraphViewContainer._computeStaticLayout.
 *
 * Returns null on error.
 */
export function computeStaticLayout(
	gd: GraphData,
	config: StaticLayoutConfig,
): StaticLayoutResult | null {
	const { layout, cx, cy, W, H, sortComparator: sortCmp, nodeSpacingMap: nsMap, app } = config;
	const shells: ShellInfo[] = [];
	const nodeShellIndex = new Map<string, number>();

	try {
		let ld: GraphData;
		switch (layout) {
			case LAYOUT_CONCENTRIC: {
				const result = applyConcentricLayout(gd, {
					centerX: cx,
					centerY: cy,
					minRadius: config.concentricMinRadius,
					radiusStep: config.concentricRadiusStep,
					sortComparator: sortCmp,
					nodeSpacingMap: nsMap,
				});
				ld = result.data;
				const s = result.shells;
				s.forEach((sh, i) => sh.nodeIds.forEach((id) => nodeShellIndex.set(id, i)));
				return { data: ld, shells: s, nodeShellIndex };
			}
			case LAYOUT_ARC:
				ld = applyArcLayout(gd, {
					centerX: cx,
					centerY: cy,
					radius: Math.min(W, H) * 0.4,
					sortComparator: sortCmp,
				});
				return { data: ld, shells, nodeShellIndex };
			case LAYOUT_SUNBURST: {
				const root = buildSunburstData(app, config.groupField);
				const result = applySunburstLayout(gd, root, {
					centerX: cx,
					centerY: cy,
					width: W,
					height: H,
					groupField: config.groupField,
					sortComparator: sortCmp,
				});
				return {
					data: result.data,
					shells,
					nodeShellIndex,
					sunburstArcs: result.arcs,
					sunburstCenter: { x: result.cx, y: result.cy },
				};
			}
			case LAYOUT_TIMELINE: {
				return computeTimelineLayout(gd, config, app);
			}
			default: {
				// Fallback to concentric
				const result = applyConcentricLayout(gd, {
					centerX: cx,
					centerY: cy,
					sortComparator: sortCmp,
					nodeSpacingMap: nsMap,
				});
				ld = result.data;
				const s = result.shells;
				s.forEach((sh, i) => sh.nodeIds.forEach((id) => nodeShellIndex.set(id, i)));
				return { data: ld, shells: s, nodeShellIndex };
			}
		}
	} catch (err) {
		console.error("[Graph Island] Layout computation failed:", err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Timeline layout (internal helper)
// ---------------------------------------------------------------------------

function computeTimelineLayout(
	gd: GraphData,
	config: StaticLayoutConfig,
	app: App,
): StaticLayoutResult {
	const { cx: _cx, cy: _cy, W, H } = config;
	void _cx;
	void _cy;

	const getNodeProp = (nodeId: string, key: string): string | undefined => {
		const fp = gd.nodes.find((n) => n.id === nodeId)?.filePath;
		if (!fp) return undefined;
		const tf = app.vault.getAbstractFileByPath(fp);
		if (!tf || !("extension" in tf)) return undefined;
		const val = app.metadataCache.getFileCache(tf as TFile)?.frontmatter?.[key];
		return val !== undefined && val !== null ? String(val) : undefined;
	};

	// Auto-detect best timeKey
	let timeKey = config.timelineKey || "date";
	const candidates = [timeKey, "start-date", "date", "created", "story_order", "order"];
	let bestKey = timeKey;
	let bestCount = 0;
	for (const candidate of candidates) {
		let count = 0;
		for (const n of gd.nodes) {
			if (getNodeProp(n.id, candidate)) count++;
		}
		if (count > bestCount) {
			bestCount = count;
			bestKey = candidate;
		}
		if (bestCount > gd.nodes.length * 0.3) break;
	}
	timeKey = bestKey;

	// Compute stepWidth from unique dates
	const timeVals = new Set<string>();
	for (const n of gd.nodes) {
		const tv = getNodeProp(n.id, timeKey);
		if (tv) timeVals.add(tv);
	}
	const numSteps = Math.max(timeVals.size, 1);
	const stepW = Math.max(8, (W - 120) / numSteps);
	const laneH = Math.max(20, Math.round(H / 20));
	const barH = Math.max(Math.round(laneH * 0.3), 4);
	const stackSp = barH + 1;

	const tlResult = applyTimelineLayout(gd, {
		timeKey,
		startX: 60,
		startY: 60,
		stepWidth: stepW,
		laneHeight: laneH,
		stackSpacing: stackSp,
		getNodeProperty: getNodeProp,
	});
	const ld = tlResult.data;

	// Build timeline bars from placements
	const endKey = config.timelineEndKey || "end-date";
	const timeIdxMap = new Map<string, number>();
	tlResult.timeSteps.forEach((ts, i) => timeIdxMap.set(ts, i));
	const bars: TimelineBarInfo[] = [];
	const maxBarWidth = Math.max(stepW * 3, 30);

	for (const p of tlResult.placements) {
		const node = ld.nodes.find((n) => n.id === p.nodeId);
		if (!node) continue;
		const endVal = getNodeProp(p.nodeId, endKey);
		if (endVal && endVal !== p.timeValue) {
			const endIdx = timeIdxMap.get(endVal);
			if (endIdx !== undefined && endIdx > p.timeIndex) {
				const rawEnd = 60 + endIdx * stepW;
				const clampedEnd = Math.min(rawEnd, node.x + maxBarWidth);
				bars.push({
					nodeId: p.nodeId,
					xStart: node.x,
					xEnd: clampedEnd,
					barHeight: barH,
					yCenter: node.y,
				});
				continue;
			}
		}
		const defaultBarW = Math.max(stepW, 10);
		bars.push({
			nodeId: p.nodeId,
			xStart: node.x,
			xEnd: node.x + defaultBarW,
			barHeight: barH,
			yCenter: node.y,
		});
	}

	// Post-process: resolve bar overlaps by shifting down
	bars.sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);
	for (let i = 1; i < bars.length; i++) {
		for (let j = 0; j < i; j++) {
			const prev = bars[j],
				cur = bars[i];
			if (cur.xStart >= prev.xEnd || prev.xStart >= cur.xEnd) continue;
			const prevBot = prev.yCenter + prev.barHeight / 2;
			const curTop = cur.yCenter - cur.barHeight / 2;
			if (curTop < prevBot) {
				cur.yCenter = prevBot + cur.barHeight / 2 + 1;
				const node = ld.nodes.find((n) => n.id === cur.nodeId);
				if (node) node.y = cur.yCenter;
			}
		}
	}

	// Compute work group separators
	const workGroupRanges: { name: string; minY: number; maxY: number }[] = [];
	{
		const workBars = new Map<string, { minY: number; maxY: number }>();
		for (const bar of bars) {
			const fp = ld.nodes.find((n) => n.id === bar.nodeId)?.filePath ?? bar.nodeId;
			const segs = fp.split("/").filter((s: string) => s.length > 0);
			let work = "other";
			for (const seg of segs) {
				if (
					seg.startsWith("classic-") ||
					seg.startsWith("mythology-") ||
					seg.startsWith("bible-") ||
					seg.includes("-")
				) {
					work = seg;
					break;
				}
			}
			const y0 = bar.yCenter - bar.barHeight / 2;
			const y1 = bar.yCenter + bar.barHeight / 2;
			const existing = workBars.get(work);
			if (existing) {
				if (y0 < existing.minY) existing.minY = y0;
				if (y1 > existing.maxY) existing.maxY = y1;
			} else {
				workBars.set(work, { minY: y0, maxY: y1 });
			}
		}
		for (const [name, range] of workBars) {
			workGroupRanges.push({ name, ...range });
		}
		workGroupRanges.sort((a, b) => a.minY - b.minY);
	}

	return {
		data: ld,
		shells: [],
		nodeShellIndex: new Map(),
		timelineBars: bars,
		timelineSteps: tlResult.timeSteps,
		timelineStepWidth: stepW,
		timelineLanes: tlResult.lanes,
		timelineWorkGroups: workGroupRanges,
	};
}
