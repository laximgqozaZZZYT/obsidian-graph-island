import { Platform } from "obsidian";
import type { PixiNode } from "./InteractionManager";
import type { RenderPipeline } from "./RenderPipeline";
import type { CanvasText } from "./canvas2d";
import { DEFAULT_RENDER_THRESHOLDS, type RenderThresholds } from "../types";
import { rectsOverlap } from "../utils/geometry";

// ---------------------------------------------------------------------------
// LabelManagerHost — the interface the LabelManager needs from its parent
// ---------------------------------------------------------------------------
export interface LabelManagerHost {
	/** The PixiNode map (id → PixiNode) */
	getPixiNodes(): Map<string, PixiNode>;
	/** Node degree map */
	getDegrees(): Map<string, number>;
	/** Panel textFadeThreshold value */
	getTextFadeThreshold(): number;
	/** Panel renderThresholds (merged with defaults by caller) */
	getRenderThresholds(): Partial<RenderThresholds> | undefined;
	/** Current world-container scale (zoom) */
	getWorldScale(): number;
	/** The render pipeline (for zone placement) */
	getRenderPipeline(): RenderPipeline | null;
	/** Sunburst layout labels map */
	getSunburstLabels(): Map<string, CanvasText>;
	/** Cluster sunburst labels map */
	getClusterSunburstLabels(): Map<string, CanvasText>;
	/** Previous highlight set (hovered node neighbourhood) */
	getPrevHighlightSet(): Set<string>;
	/** Active search query (empty = no search) */
	getSearchQuery(): string;
	/** Mark the render loop as needing a redraw */
	markDirty(force?: boolean): void;
}

// ---------------------------------------------------------------------------
// LabelManager
// ---------------------------------------------------------------------------
/**
 * Manages label LOD (level-of-detail), truncation, priority scoring,
 * counter-scaling, diversity guarantee, and rotated-label culling.
 *
 * Extracted from GraphViewContainer to reduce God Object complexity.
 */
export class LabelManager {
	// HZ: Track previous label mode for hysteresis — prevents flicker at mode boundaries
	private _prevLabelMode: "initials" | "truncated" | "full" = "full";
	constructor(private host: LabelManagerHost) {}

	// =========================================================================
	// Public API
	// =========================================================================

	/** Main label update pipeline — called after panel changes and zoom. */
	applyTextFade(): void {
		const baseOpacity = 1 - this.host.getTextFadeThreshold();
		const zoom = this.host.getWorldScale();
		const degrees = this.host.getDegrees();
		const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds() };

		// Step 1: Compute priority scores and minShowZoom (once per rebuild)
		this._computePriorityScores(rt);

		// Step 2: Counter-scaling with minimum screen-size guarantee
		const LABEL_FONT = rt.nodeLabelFontSizeMin;
		const rawScale = 1 / Math.pow(zoom, rt.labelScalePower);
		const floorScale = rt.labelMinScreenPx / (LABEL_FONT * zoom);
		// At extreme zoom-out (<0.1), allow higher counter-scale for readability
		const effectiveScaleMax = zoom < 0.1 ? (rt.labelScaleMaxExtreme ?? 7) : rt.labelScaleMax;
		const counterScale = Math.min(effectiveScaleMax, Math.max(rt.labelScaleMin, rawScale, floorScale));

		// Step 3-4: Per-node LOD evaluation (truncation, placement, hysteresis)
		const candidates = this._evaluateLOD(zoom, counterScale, rt, degrees, baseOpacity);

		// Step 5: Diversity guarantee and maxVisible cap
		this._applyDiversityAndCap(candidates, rt, degrees, baseOpacity);

		// Step 5.5: Search query label highlight
		this._applySearchHighlight(candidates);

		// Step 6: Group/sunburst/grid label scaling
		this._scaleGroupLabels(zoom, rt);

		this.host.markDirty();
	}

	/** Called by InteractionManager after zoom changes to update label visibility. */
	updateLabelsForZoom(): void {
		this.applyTextFade();
		// Re-cull node labels with leader lines after counter-scale changes
		this.host.getRenderPipeline()?.cullOverlappingLabels();
		// Re-cull rotated labels after zoom change (screen-space overlap changes)
		this.cullOverlappingRotatedLabels(this.host.getClusterSunburstLabels());
		this.cullOverlappingRotatedLabels(this.host.getSunburstLabels());
	}

	/**
	 * Hide rotated labels that overlap with higher-priority labels.
	 * Uses rotated bounding-box AABB approximation with pre-render width estimation.
	 */
	cullOverlappingRotatedLabels(labels: Map<string, CanvasText>): void {
		if (labels.size === 0) return;

		// Use extracted pure functions for width estimation and AABB computation
		const estimateWidth = (txt: CanvasText): number => {
			if (txt.width > 0) return txt.width;
			const fontSize = txt.style.fontSize ?? 11;
			const isBold = txt.style.fontWeight === "bold" || txt.style.fontWeight === "600";
			return estimateTextWidth(txt.text, fontSize, isBold);
		};

		const rotatedAABB = (txt: CanvasText) => {
			const w = estimateWidth(txt);
			const h = txt.height || (txt.style.fontSize ?? 11);
			return computeRotatedAABB(w, h, txt.rotation, txt.anchor.x, txt.anchor.y, txt.x, txt.y);
		};

		// Collect visible labels with their AABBs, then sort by text length (priority: longer = more important)
		const candidates: { txt: CanvasText; rect: { x: number; y: number; w: number; h: number } }[] = [];
		for (const [, txt] of labels) {
			if (!txt.visible) continue;
			candidates.push({ txt, rect: rotatedAABB(txt) });
		}
		candidates.sort((a, b) => b.txt.text.length - a.txt.text.length);

		// Spatial hash grid for O(n×k) overlap detection
		const CELL = 120;
		const gridMap = new Map<number, { x: number; y: number; w: number; h: number }[]>();
		const key = (cx: number, cy: number) => cx * 100003 + cy;

		const insertGrid = (r: { x: number; y: number; w: number; h: number }) => {
			const x0 = Math.floor(r.x / CELL),
				y0 = Math.floor(r.y / CELL);
			const x1 = Math.floor((r.x + r.w) / CELL),
				y1 = Math.floor((r.y + r.h) / CELL);
			for (let cx = x0; cx <= x1; cx++)
				for (let cy = y0; cy <= y1; cy++) {
					const k = key(cx, cy);
					const arr = gridMap.get(k);
					if (arr) arr.push(r);
					else gridMap.set(k, [r]);
				}
		};

		const checkGrid = (r: { x: number; y: number; w: number; h: number }): boolean => {
			const x0 = Math.floor(r.x / CELL),
				y0 = Math.floor(r.y / CELL);
			const x1 = Math.floor((r.x + r.w) / CELL),
				y1 = Math.floor((r.y + r.h) / CELL);
			for (let cx = x0; cx <= x1; cx++)
				for (let cy = y0; cy <= y1; cy++) {
					const arr = gridMap.get(key(cx, cy));
					if (!arr) continue;
					for (const p of arr) {
						if (rectsOverlap(r, p)) return true;
					}
				}
			return false;
		};

		for (const { txt, rect } of candidates) {
			if (checkGrid(rect)) {
				txt.visible = false;
			} else {
				insertGrid(rect);
			}
		}
	}

	// =========================================================================
	// Private pipeline steps
	// =========================================================================

	/** Compute priority scores and minShowZoom for all PixiNodes (cached, recomputed only when needed). */
	private _computePriorityScores(rt: RenderThresholds): void {
		const degrees = this.host.getDegrees();
		const pixiArr = [...this.host.getPixiNodes().values()];
		// Recompute when scores are uninitialized. Use -1 sentinel instead of 0
		// to avoid false positives for nodes with genuinely zero degree.
		const needsScoreRecompute = pixiArr.length > 0 && pixiArr[0].priorityScore <= 0;
		if (!needsScoreRecompute) return;

		let maxDeg = 0;
		for (const d of degrees.values()) {
			if (d > maxDeg) maxDeg = d;
		}
		// Assign priority scores
		for (const pn of pixiArr) {
			const deg = degrees.get(pn.data.id) ?? 0;
			const degPct = maxDeg > 0 ? deg / maxDeg : 0;
			const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			// Priority: super=150+degPct*50, regular=degPct*100
			pn.priorityScore = isSuper ? 150 + degPct * 50 : degPct * 100;
		}
		// Sort by priority and assign minShowZoom based on rank
		const sorted = [...pixiArr].filter((p) => p.label).sort((a, b) => b.priorityScore - a.priorityScore);
		const n = sorted.length;
		// LOD tiers — all boundaries from RenderThresholds (no hardcoded values)
		const lodZoom1 = rt.labelZoomTier1 ?? 0.01;
		const lodZoom2 = rt.labelZoomTier2 ?? 0.02;
		const lodZoom3 = rt.labelZoomTier3 ?? 0.03;
		const lodPct1 = rt.labelDegreePctTier1 ?? 0.03;
		const lodPct2 = rt.labelDegreePctTier2 ?? 0.1;
		const lodPct3 = rt.labelDegreePctTier3 ?? 0.3;
		// Interpolation: rank percentile -> minShowZoom
		const lodZoomFloor = rt.nodeLabelZoomMin ?? 0.9;
		for (let i = 0; i < n; i++) {
			const pct = i / n; // 0 = highest priority, 1 = lowest
			let minZ: number;
			if (pct < lodPct1 * 0.1)
				minZ = lodZoom1 * 0.2; // top ~1%: near-always visible
			else if (pct < lodPct1)
				minZ = lodZoom1; // top tier1%
			else if (pct < lodPct2)
				minZ = lodZoom2; // top tier2%
			else if (pct < lodPct3)
				minZ = lodZoom3; // top tier3%
			else minZ = lodZoomFloor; // rest
			sorted[i].minShowZoom = minZ;
		}
	}

	/** Resolve the 3-tier label mode (initials / truncated / full) with hysteresis. */
	private _resolveLabelMode(
		zoom: number,
		rt: RenderThresholds,
	): { labelMode: "initials" | "truncated" | "full"; shouldTruncate: boolean; effectiveMaxChars: number } {
		const initialsZoom = rt.labelInitialsZoom ?? 0.2;
		const truncateZoom = rt.labelTruncateZoom ?? 0.35;
		const truncateMaxChars = rt.labelTruncateMaxChars ?? 12;
		const truncateMinChars = rt.labelTruncateMinChars ?? 5;
		const modeOverride = rt.labelModeOverride ?? "auto";
		// Safety: even with "full" override, apply truncation at extreme zoom to prevent AABB overflow
		const safeOverride = modeOverride === "full" && zoom < 0.1 ? "truncated" : modeOverride;
		// HZ: Hysteresis band (±0.02) prevents flicker at mode boundaries
		const hyst = 0.02;
		const prevMode = this._prevLabelMode;
		const labelMode: "initials" | "truncated" | "full" =
			safeOverride !== "auto"
				? safeOverride
				: prevMode === "initials" && zoom < initialsZoom + hyst
					? "initials"
					: prevMode === "full" && zoom > truncateZoom - hyst
						? "full"
						: zoom < initialsZoom
							? "initials"
							: zoom < truncateZoom
								? "truncated"
								: "full";
		this._prevLabelMode = labelMode;
		const shouldTruncate = labelMode !== "full";
		const effectiveMaxChars =
			labelMode === "initials"
				? 2
				: labelMode === "truncated"
					? Math.max(
							truncateMinChars,
							Math.round(truncateMaxChars * ((zoom - initialsZoom) / (truncateZoom - initialsZoom))),
						)
					: Infinity;
		return { labelMode, shouldTruncate, effectiveMaxChars };
	}

	/** Update tag-label and sub-label visibility/scale for a single node. */
	private _updateAuxLabels(
		pn: PixiNode,
		zoom: number,
		tagLabelZoomMin: number,
		subLabelForceShow: boolean,
		counterScale: number,
		tagLabelShow: boolean,
	): void {
		if (pn.tagLabel) {
			pn.tagLabel.visible = tagLabelShow && (zoom >= tagLabelZoomMin || subLabelForceShow);
			if (pn.tagLabel.visible) pn.tagLabel.scale.set(counterScale);
		}
		if (pn.subLabels) {
			for (const sl of pn.subLabels) {
				sl.visible = zoom >= tagLabelZoomMin || subLabelForceShow;
				if (sl.visible) sl.scale.set(counterScale);
			}
		}
	}

	/** Compute the adaptive label scale for a single node. */
	private _computeAdaptiveScale(
		nodeDeg: number,
		maxDeg: number,
		adaptiveMin: number,
		adaptiveMax: number,
		counterScale: number,
		zoom: number,
		rt: RenderThresholds,
	): number {
		const degRatio = maxDeg > 0 ? nodeDeg / maxDeg : 0;
		const adaptiveScale = adaptiveMin + degRatio * (adaptiveMax - adaptiveMin);
		const scaleCap = zoom < 0.1 ? (rt.labelScaleMaxExtreme ?? 7) * 1.2 : (rt.labelScaleMax ?? 6) * 1.5;
		return Math.min(counterScale * adaptiveScale, scaleCap);
	}

	/** Position a label using zone-based or fixed placement. */
	private _positionLabel(
		pn: PixiNode,
		counterScale: number,
		rt: RenderThresholds,
		renderPipeline: ReturnType<typeof this.host.getRenderPipeline>,
	): void {
		if (!pn.label) return;
		const r = pn.radius ?? 12;
		if (rt.labelZonePlacement && renderPipeline) {
			const placement = renderPipeline.computeZonePlacement(pn.data, r, rt.labelZoneOffset ?? 6);
			pn.label.x = placement.x;
			pn.label.y = placement.y;
			pn.label.anchor.set(placement.anchorX, 0);
		} else {
			const csOffset = counterScale > 2 ? Math.min(counterScale * 1.5, 12) : 0;
			pn.label.x = r + 2 + csOffset;
			pn.label.y = -(r * 0.4 + 2 + csOffset * 0.5);
		}
	}

	/** Check if a node should be filtered out by AutoLOD level 2. */
	private _isFilteredByAutoLOD(
		pn: PixiNode,
		isSuper: boolean,
		isHovered: boolean,
	): boolean {
		if (isSuper || isHovered) return false;
		const rp = this.host.getRenderPipeline();
		if (!rp?.isAutoLODActive() || rp.getLastLodLevel() !== 2) return false;
		return pn.priorityScore <= 70;
	}

	/** Determine whether a node label is eligible for display (priority LOD + hysteresis). */
	private _isLabelEligible(
		pn: PixiNode,
		zoom: number,
		hysteresisHideFactor: number,
		isSuper: boolean,
		isHovered: boolean,
	): boolean {
		if (isSuper || isHovered) return true;
		const showThreshold = pn.minShowZoom;
		const hideThreshold = showThreshold * hysteresisHideFactor;
		if (pn.labelWasVisible) return zoom >= hideThreshold;
		return zoom >= showThreshold;
	}

	/** Hide a node's label and associated sub-labels. */
	private _hideNodeLabel(pn: PixiNode): void {
		pn.label!.visible = false;
		pn.label!.alpha = 0;
		pn.labelWasVisible = false;
		if (pn.tagLabel) pn.tagLabel.visible = false;
		if (pn.subLabels) for (const sl of pn.subLabels) sl.visible = false;
	}

	/** Evaluate per-node label visibility: apply counter-scaling, truncation, placement, and LOD hysteresis.
	 *  Returns the list of eligible label candidates. */
	private _evaluateLOD(
		zoom: number,
		counterScale: number,
		rt: RenderThresholds,
		degrees: Map<string, number>,
		_baseOpacity: number,
	): { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[] {
		const hoverSet = this.host.getPrevHighlightSet();
		const renderPipeline = this.host.getRenderPipeline();

		const { labelMode, shouldTruncate, effectiveMaxChars } = this._resolveLabelMode(zoom, rt);

		const tagLabelZoomMin = rt.tagLabelZoomMin ?? 1.2;
		const tagLabelShow = rt.tagLabelShow !== false;

		// Hysteresis: zoom-adaptive wider band at extreme zoom to prevent flicker
		const baseHysteresis = rt.labelHysteresisHideFactor ?? 0.7;
		const hysteresisHideFactor = zoom < 0.2 ? 0.5 : zoom < 0.5 ? 0.6 : baseHysteresis;

		const candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[] = [];

		// R6: Adaptive label font size — precompute max degree
		const adaptiveMin = rt.adaptiveLabelMin ?? 0.7;
		const adaptiveMax = rt.adaptiveLabelMax ?? 1.5;
		let maxDegForAdaptive = 1;
		for (const d of degrees.values()) {
			if (d > maxDegForAdaptive) maxDegForAdaptive = d;
		}

		// A1: autoLOD level 4+ bypasses sub-label zoom threshold
		const autoLodLevel = renderPipeline?.isAutoLODActive() ? renderPipeline.getLastLodLevel() : 0;
		const subLabelForceShow = autoLodLevel >= 4;

		for (const pn of this.host.getPixiNodes().values()) {
			this._updateAuxLabels(pn, zoom, tagLabelZoomMin, subLabelForceShow, counterScale, tagLabelShow);

			if (!pn.label) continue;

			// Apply counter-scaling with R6 adaptive label sizing
			const nodeDeg = degrees.get(pn.data.id) ?? 0;
			const finalScale = this._computeAdaptiveScale(
				nodeDeg, maxDegForAdaptive, adaptiveMin, adaptiveMax, counterScale, zoom, rt,
			);
			pn.label.scale.set(finalScale);

			this._applyTruncation(pn, shouldTruncate, effectiveMaxChars, labelMode);

			this._positionLabel(pn, counterScale, rt, renderPipeline);

			const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			const isHovered = hoverSet.size > 0 && hoverSet.has(pn.data.id);
			const deg = degrees.get(pn.data.id) ?? 0;

			const eligible =
				this._isLabelEligible(pn, zoom, hysteresisHideFactor, isSuper, isHovered) &&
				!this._isFilteredByAutoLOD(pn, isSuper, isHovered);

			if (!eligible) {
				this._hideNodeLabel(pn);
				continue;
			}

			candidates.push({ pn, deg, isSuper, isHovered });
		}

		return candidates;
	}

	/** Apply smart truncation to a node label based on zoom level.
	 *  Supports 3 modes: "initials" (2-char), "truncated" (5-12 char), "full". */
	private _applyTruncation(
		pn: PixiNode,
		shouldTruncate: boolean,
		effectiveMaxChars: number,
		labelMode: "initials" | "truncated" | "full" = "full",
	): void {
		if (!pn.label) return;
		if (shouldTruncate && pn.label.text) {
			const fullText = pn.data.label || pn.data.id;
			if (labelMode === "initials") {
				pn.label.text = extractInitials(fullText);
			} else {
				pn.label.text = smartTruncateLabel(fullText, effectiveMaxChars);
			}
		} else if (pn.label.text) {
			pn.label.text = pn.data.label || pn.data.id;
		}
	}

	/** AP-5 diversity guarantee (promote non-super nodes) and apply maxVisible cap. */
	private _applyDiversityAndCap(
		candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[],
		rt: RenderThresholds,
		degrees: Map<string, number>,
		baseOpacity: number,
	): void {
		// Zoom-based dynamic cap: at zoom-out, show fewer labels to prevent overlap
		const zoom = this.host.getWorldScale();
		// Small-graph boost: show all labels when few nodes, more labels for medium graphs
		// Map-style labeling: no maxVisible cap. Show all labels that pass
		// LOD tier checks. Overlap culling handles density separately.
		// Mobile lightweight mode: cap labels to 50 for performance
		const maxVisible = Platform.isMobile ? 50 : 0; // 0 = no cap

		// AP-5 diversity guarantee: promote top non-super nodes if too few
		this._promoteDiversityNodes(candidates, rt, degrees, baseOpacity);

		// Sort by priority score, apply maxVisible cap
		candidates.sort((a, b) => b.pn.priorityScore - a.pn.priorityScore);

		let visCount = 0;
		for (const c of candidates) {
			const { pn, isHovered, isSuper } = c;
			// Super-nodes and hovered nodes always bypass the maxVisible cap
			if (isHovered || isSuper) {
				pn.label!.visible = true;
				pn.label!.alpha = Math.max(rt.labelAlphaMin ?? 0.7, baseOpacity);
				pn.labelWasVisible = true;
				continue;
			}
			if (maxVisible > 0 && visCount >= maxVisible) {
				pn.label!.visible = false;
				pn.label!.alpha = 0;
				pn.labelWasVisible = false;
				if (pn.tagLabel) pn.tagLabel.visible = false;
				if (pn.subLabels) for (const sl of pn.subLabels) sl.visible = false;
				continue;
			}
			pn.label!.visible = true;
			pn.label!.alpha = Math.max(rt.labelAlphaMin ?? 0.7, baseOpacity);
			pn.labelWasVisible = true;
			visCount++;
		}

		// Zoom-out label emphasis: boost background opacity for surviving labels
		// so they stand out as "important nodes" at low zoom
		if (zoom < 0.5) {
			const emphasisBoost = Math.min(0.3, (0.5 - zoom) * 0.6); // up to 0.3 boost
			for (const c of candidates) {
				if (!c.pn.label?.visible) continue;
				const lbl = c.pn.label;
				if (lbl.bgAlpha != null) {
					lbl.bgAlpha = Math.min(1.0, lbl.bgAlpha + emphasisBoost);
				}
				// Slightly increase padding for better readability
				if (lbl.bgPadX != null) {
					lbl.bgPadX = Math.max(lbl.bgPadX, 4 + emphasisBoost * 10);
				}
			}
		}
	}

	private _promoteDiversityNodes(
		candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[],
		rt: RenderThresholds,
		degrees: Map<string, number>,
		baseOpacity: number,
	): void {
		const eligibleNonSuper = candidates.filter((c) => !c.isSuper).length;
		const eligibleSuper = candidates.filter((c) => c.isSuper).length;
		const targetRegulars = Math.max(rt.labelMinNonSuper ?? 5, Math.ceil(eligibleSuper * 0.5));
		if (eligibleNonSuper >= targetRegulars) return;
		const needed = targetRegulars - eligibleNonSuper;
		const hiddenNonSupers: { pn: PixiNode; deg: number }[] = [];
		for (const pn of this.host.getPixiNodes().values()) {
			if (!pn.label || !pn.label.text) continue;
			const isS = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
			if (isS) continue;
			if (candidates.some((c) => c.pn === pn)) continue;
			const d = degrees.get(pn.data.id) ?? 0;
			hiddenNonSupers.push({ pn, deg: d });
		}
		hiddenNonSupers.sort((a, b) => b.deg - a.deg);
		for (let i = 0; i < Math.min(needed, hiddenNonSupers.length); i++) {
			const { pn: npn, deg: ndeg } = hiddenNonSupers[i];
			npn.label!.visible = true;
			npn.label!.alpha = Math.max(rt.labelAlphaMin ?? 0.7, baseOpacity);
			candidates.push({ pn: npn, deg: ndeg, isSuper: false, isHovered: false });
		}
	}

	/** Highlight labels of nodes matching the active search query.
	 *  Matching labels get bold font weight and priority boost. */
	private _applySearchHighlight(
		candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[],
	): void {
		const query = this.host.getSearchQuery();
		if (!query) return;
		const lowerQuery = query.toLowerCase();
		// Simple substring match on label text for highlighting
		// (full query evaluation is done by data pipeline; this is visual-only)
		for (const c of candidates) {
			if (!c.pn.label?.visible) continue;
			const label = c.pn.label;
			const text = (c.pn.data.label ?? c.pn.data.id).toLowerCase();
			if (text.includes(lowerQuery) || lowerQuery.includes("folder:") || lowerQuery.includes("tag:")) {
				// Search-matched node: bold label + slightly larger
				label.style.fontWeight = "bold";
				if (label.bgAlpha != null) label.bgAlpha = Math.min(1.0, label.bgAlpha + 0.15);
			}
		}
	}

	/** Scale sunburst, cluster sunburst, and group grid labels based on zoom level. */
	private _scaleGroupLabels(zoom: number, rt: RenderThresholds): void {
		// Enclosure labels are managed by EnclosureRenderer (drawEnclosuresImpl)
		// which runs every frame with its own zoom-dependent scaling (1/ws).
		// We only handle sunburst/grid labels here.

		const groupLabelScale = Math.min(
			rt.groupLabelScaleMax ?? 4.0,
			Math.max(rt.groupLabelScaleMin ?? 0.6, 1 / Math.pow(zoom, rt.groupLabelScalePower ?? 0.45)),
		);

		const zoomTier1 = rt.labelZoomTier1 ?? 0.01;

		// --- Cluster sunburst labels: hide at low zoom ---
		for (const [, lbl] of this.host.getClusterSunburstLabels()) {
			if (zoom < zoomTier1) {
				lbl.visible = false;
			} else {
				lbl.scale.set(groupLabelScale);
			}
		}

		// --- Sunburst layout labels ---
		for (const [, lbl] of this.host.getSunburstLabels()) {
			if (zoom < zoomTier1) {
				lbl.visible = false;
			} else {
				lbl.scale.set(groupLabelScale);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Exported pure helpers (extracted from LabelManager for testability)
// ---------------------------------------------------------------------------

/** Extract 2-character initials from a label string.
 *  Uses path separators (/) and hyphens (-) to find segment boundaries.
 *  E.g. "classic-othello/characters" → "OC", "mythology" → "MY" */
/** Input entry for priority score computation */
export interface PriorityInput {
	id: string;
	isSuper: boolean;
	hasLabel: boolean;
}

/** Computed priority score + LOD tier assignment */
interface PriorityResult {
	id: string;
	priorityScore: number;
	minShowZoom: number;
}

/** Compute priority scores and LOD tier assignments for label visibility.
 *  Pure function — no side effects, returns computed values. */
export function computePriorityScores(
	nodes: PriorityInput[],
	degrees: Map<string, number>,
	rt: {
		labelZoomTier1: number;
		labelZoomTier2: number;
		labelZoomTier3: number;
		labelDegreePctTier1: number;
		labelDegreePctTier2: number;
		labelDegreePctTier3: number;
		nodeLabelZoomMin?: number;
	},
): PriorityResult[] {
	if (nodes.length === 0) return [];

	let maxDeg = 0;
	for (const d of degrees.values()) {
		if (d > maxDeg) maxDeg = d;
	}

	// Assign priority scores
	const scored = nodes.map((n) => {
		const deg = degrees.get(n.id) ?? 0;
		const degPct = maxDeg > 0 ? deg / maxDeg : 0;
		const priorityScore = n.isSuper ? 150 + degPct * 50 : degPct * 100;
		return { id: n.id, priorityScore, hasLabel: n.hasLabel, minShowZoom: 0 };
	});

	// Sort by priority and assign minShowZoom based on rank
	const sorted = scored.filter((s) => s.hasLabel).sort((a, b) => b.priorityScore - a.priorityScore);
	const len = sorted.length;
	const lodZoom1 = rt.labelZoomTier1;
	const lodZoom2 = rt.labelZoomTier2;
	const lodZoom3 = rt.labelZoomTier3;
	const lodPct1 = rt.labelDegreePctTier1;
	const lodPct2 = rt.labelDegreePctTier2;
	const lodPct3 = rt.labelDegreePctTier3;
	const lodZoomFloor = rt.nodeLabelZoomMin ?? 0.9;

	for (let i = 0; i < len; i++) {
		const pct = i / len;
		let minZ: number;
		if (pct < lodPct1 * 0.1) minZ = lodZoom1 * 0.2;
		else if (pct < lodPct1) minZ = lodZoom1;
		else if (pct < lodPct2) minZ = lodZoom2;
		else if (pct < lodPct3) minZ = lodZoom3;
		else minZ = lodZoomFloor;
		sorted[i].minShowZoom = minZ;
	}

	return scored.map((s) => ({ id: s.id, priorityScore: s.priorityScore, minShowZoom: s.minShowZoom }));
}

export function extractInitials(text: string): string {
	// Remove group suffix like " (15)"
	const clean = text.replace(/\s*\(\d+\)$/, "");
	// Split by path separator and hyphens
	const segments = clean.split(/[/\-_\s]+/).filter((s) => s.length > 0);
	if (segments.length >= 2) {
		// Take first letter of last two meaningful segments
		return (segments[segments.length - 2][0] + segments[segments.length - 1][0]).toUpperCase();
	}
	// Single word: take first two characters
	return clean.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Pure helper functions extracted from LabelManager methods
// ---------------------------------------------------------------------------

/** Estimate text width before first render using character-count heuristic. */
export function estimateTextWidth(text: string, fontSize: number, isBold: boolean): number {
	return text.length * fontSize * (isBold ? 0.65 : 0.58);
}

/** Compute axis-aligned bounding box for a rotated rectangle.
 *  @param w - width
 *  @param h - height
 *  @param rotation - rotation in radians
 *  @param anchorX - anchor X (0-1)
 *  @param anchorY - anchor Y (0-1)
 *  @param posX - world X position
 *  @param posY - world Y position
 */
export function computeRotatedAABB(
	w: number,
	h: number,
	rotation: number,
	anchorX: number,
	anchorY: number,
	posX: number,
	posY: number,
): { x: number; y: number; w: number; h: number } {
	const cos = Math.abs(Math.cos(rotation));
	const sin = Math.abs(Math.sin(rotation));
	const bw = w * cos + h * sin;
	const bh = w * sin + h * cos;
	return { x: posX - bw * anchorX, y: posY - bh * anchorY, w: bw, h: bh };
}

/** Smart label truncation: slash-path → parent/child hint, dash → after-dash, else → ellipsis. */
export function smartTruncateLabel(fullText: string, maxChars: number): string {
	if (fullText.length <= maxChars) return fullText;
	const slashIdx = fullText.lastIndexOf("/");
	const dashIdx = fullText.indexOf("-");
	if (slashIdx > 0 && slashIdx < fullText.length - 1) {
		const parent = fullText.slice(0, slashIdx);
		const distinctStart = dashIdx > 0 && dashIdx < slashIdx ? dashIdx + 1 : 0;
		const parentDistinct = parent.slice(distinctStart, distinctStart + Math.max(3, maxChars - 2));
		const child = fullText.slice(slashIdx + 1);
		const childHint = child.length > 3 ? child.slice(0, 3) : child;
		return parentDistinct + "/" + childHint;
	}
	if (dashIdx > 0 && dashIdx < maxChars) {
		const afterDash = fullText.slice(dashIdx + 1);
		return afterDash.length > maxChars ? afterDash.slice(0, maxChars - 1) + "\u2026" : afterDash;
	}
	return fullText.slice(0, maxChars - 1) + "\u2026";
}

export type LabelMode = "initials" | "truncated" | "full";

/** Select label display mode based on zoom with hysteresis to prevent flicker.
 *  @param zoom - current zoom level
 *  @param prevMode - previous mode (for hysteresis)
 *  @param initialsZoom - threshold below which initials mode activates
 *  @param truncateZoom - threshold below which truncated mode activates
 *  @param hyst - hysteresis band (±)
 */
export function selectLabelMode(
	zoom: number,
	prevMode: LabelMode,
	initialsZoom: number,
	truncateZoom: number,
	hyst: number,
): LabelMode {
	if (prevMode === "initials" && zoom < initialsZoom + hyst) return "initials";
	if (prevMode === "full" && zoom > truncateZoom - hyst) return "full";
	if (zoom < initialsZoom) return "initials";
	if (zoom < truncateZoom) return "truncated";
	return "full";
}
