/**
 * Semantic-zoom rendering functions extracted from RenderPipeline.
 * Handles per-node LOD tiers: dot → circle → compact card → full card.
 */
import type { CanvasGraphics } from "./canvas2d";
import type { PixiNode } from "./InteractionManager";
import type { RenderThresholds, CardRenderConfig } from "../types";
import type { ShapeRule } from "../utils/node-shapes";
import { getNodeShape, drawShapeAt } from "../utils/node-shapes";
import { contrastColor } from "../utils/color";
import { darkenColor } from "./render-pipeline-utils";
import { truncateLabel } from "./RenderPipeline";
import {
	createCardText,
	cleanupCardText,
	CARD_SCALE_CAP,
	CARD_LINE_HEIGHT,
	CARD_SUB_FONT_RATIO,
	COMPACT_CARD_FONT_MIN,
	COMPACT_CARD_FONT_BASE,
	FULL_CARD_FONT_BASE,
	FULL_CARD_FONT_MIN,
	SUB_LABEL_FONT_SIZE,
	SUB_LABEL_GAP,
} from "./card-renderer";

// ---------------------------------------------------------------------------
// Shared context types
// ---------------------------------------------------------------------------

/** Rendering context for semantic-zoom mode. */
export interface SemanticZoomCtx {
	visible: PixiNode[];
	pixiNodes: Map<string, PixiNode>;
	tlFilteredOut: Set<string> | null;
	alpha: number;
	nodeCount: number;
	shapeRules: ShapeRule[];
	worldScale: number;
	minWorldRadius: number;
}

/** Host information needed by semantic-zoom rendering (subset of RenderHost). */
export interface SemanticZoomHost {
	definitionField: string;
	highContrast: boolean;
	labelColor: number;
}

// ---------------------------------------------------------------------------
// Compact card background (LOD 4)
// ---------------------------------------------------------------------------

/**
 * Render compact card background (rounded rect) behind a node.
 * Height expands to accommodate sub-labels when present.
 */
export function renderCompactCardBg(
	g: CanvasGraphics,
	pn: PixiNode,
	crc: Required<CardRenderConfig>,
): void {
	const w = pn.radius * crc.compactCardWidthRatio;
	const subCount = pn.subLabels?.length ?? 0;
	const h = pn.radius * crc.compactCardHeightRatio + subCount * (SUB_LABEL_FONT_SIZE + SUB_LABEL_GAP) * 0.06;
	const x = pn.data.x - w / 2;
	const y = pn.data.y - h / 2;
	g.lineStyle(1, pn.color, crc.compactCardStrokeAlpha);
	g.beginFill(pn.color, crc.compactCardFillAlpha);
	g.drawRoundedRect(x, y, w, h, crc.cardCornerRadius);
	g.endFill();
	g.lineStyle(0);
}

// ---------------------------------------------------------------------------
// Semantic zoom mode (Tier 1–4)
// ---------------------------------------------------------------------------

/**
 * Semantic zoom — per-node LOD based on screen-space size.
 * Tier 1: colored dot (screenPx < 1.5)
 * Tier 2: circle + label (screenPx < compactPx)
 * Tier 3: compact card — name + definition field (screenPx < fullPx)
 * Tier 4: full card — name + definition + bodyPreview
 */
export function renderSemanticZoomMode(
	host: SemanticZoomHost,
	g: CanvasGraphics,
	ctx: SemanticZoomCtx,
	crc: Record<string, number>,
	rt: Required<RenderThresholds>,
): void {
	const { visible, tlFilteredOut, alpha, shapeRules, worldScale, minWorldRadius } = ctx;
	const compactPx = rt.semanticZoomCompactPx;
	const fullPx = rt.semanticZoomFullPx;
	const defField = host.definitionField;
	const hcSem = host.highContrast ? 2 : 1;
	const labelColor = host.labelColor;

	for (const pn of visible) {
		const effR = Math.max(pn.radius, minWorldRadius);
		const screenPx = effR * 2 * worldScale;
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;

		if (screenPx < rt.semanticZoomDotPx) {
			// Tier 1: colored dot
			const dotSize = 1 / worldScale;
			g.lineStyle(0);
			g.beginFill(pn.color, nodeAlpha);
			g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
			g.endFill();
		} else if (screenPx < compactPx) {
			// Tier 2: circle + label
			const shape = getNodeShape(pn.data, shapeRules);
			const strokeColor = darkenColor(pn.color, crc.strokeDarken);
			g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
			g.beginFill(pn.color, nodeAlpha);
			drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
			g.endFill();
		} else if (screenPx < fullPx) {
			// Tier 3: compact card (name + definition field)
			_renderCompactCard(g, pn, effR, worldScale, nodeAlpha, defField, labelColor, hcSem, crc, rt);
		} else {
			// Tier 4: full card (name + definition + bodyPreview)
			_renderFullCard(g, pn, effR, worldScale, nodeAlpha, defField, labelColor, hcSem, crc, rt);
		}
	}
}

// ---------------------------------------------------------------------------
// Private tier renderers
// ---------------------------------------------------------------------------

function _renderCompactCard(
	g: CanvasGraphics,
	pn: PixiNode,
	effR: number,
	worldScale: number,
	nodeAlpha: number,
	defField: string,
	labelColor: number,
	hcSem: number,
	crc: Record<string, number>,
	rt: Required<RenderThresholds>,
): void {
	const cardW = effR * 4;
	const cardH = effR * 2;
	const halfW = cardW / 2;
	const halfH = cardH / 2;
	const strokeColor = darkenColor(pn.color, crc.strokeDarken);
	g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
	g.beginFill(pn.color, nodeAlpha * crc.semanticCardFillAlpha);
	g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 2 / worldScale);
	g.endFill();

	const gfx = pn.gfx;
	cleanupCardText(gfx);
	const fontSize = Math.min(
		Math.max(COMPACT_CARD_FONT_MIN, COMPACT_CARD_FONT_BASE / worldScale),
		COMPACT_CARD_FONT_BASE * CARD_SCALE_CAP,
	);
	const nameText = createCardText(
		truncateLabel(pn.data.label, rt.labelMaxChars),
		fontSize,
		labelColor,
		"bold",
	);
	nameText.x = -halfW + 2 / worldScale;
	nameText.y = -halfH + 2 / worldScale;
	nameText.maxWidth = cardW - 4 / worldScale;
	gfx.addChild(nameText);

	if (defField && pn.data.meta?.[defField]) {
		const defText = createCardText(
			String(pn.data.meta[defField]),
			fontSize * CARD_SUB_FONT_RATIO,
			labelColor,
		);
		defText.x = -halfW + 2 / worldScale;
		defText.y = -halfH + fontSize * CARD_LINE_HEIGHT + 2 / worldScale;
		defText.maxWidth = cardW - 4 / worldScale;
		defText.alpha = crc.cardSubTextAlpha;
		gfx.addChild(defText);
	}
}

function _renderFullCard(
	g: CanvasGraphics,
	pn: PixiNode,
	effR: number,
	worldScale: number,
	nodeAlpha: number,
	defField: string,
	labelColor: number,
	hcSem: number,
	crc: Record<string, number>,
	rt: Required<RenderThresholds>,
): void {
	const cardW = effR * 5;
	const cardH = effR * 3;
	const halfW = cardW / 2;
	const halfH = cardH / 2;
	const strokeColor = darkenColor(pn.color, crc.strokeDarken);
	g.lineStyle(hcSem, strokeColor, nodeAlpha * crc.strokeAlpha);
	g.beginFill(pn.color, nodeAlpha * crc.semanticCardFullFillAlpha);
	g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 3 / worldScale);
	g.endFill();

	// Header bar
	const headerH = effR * crc.semanticCardHeaderHeightRatio;
	g.beginFill(pn.color, nodeAlpha * crc.semanticCardHeaderFillAlpha);
	g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, headerH, 3 / worldScale);
	g.endFill();

	const gfx = pn.gfx;
	cleanupCardText(gfx);
	const fontSize = Math.min(
		Math.max(FULL_CARD_FONT_MIN, FULL_CARD_FONT_BASE / worldScale),
		FULL_CARD_FONT_BASE * CARD_SCALE_CAP,
	);
	const smallFont = fontSize * CARD_SUB_FONT_RATIO;
	let curY = -halfH + 3 / worldScale;

	const nameText = createCardText(
		truncateLabel(pn.data.label, rt.labelMaxChars),
		fontSize,
		contrastColor(pn.color),
		"bold",
	);
	nameText.x = -halfW + 3 / worldScale;
	nameText.y = curY;
	nameText.maxWidth = cardW - 6 / worldScale;
	gfx.addChild(nameText);
	curY += fontSize * CARD_LINE_HEIGHT;

	if (defField && pn.data.meta?.[defField]) {
		const defText = createCardText(String(pn.data.meta[defField]), smallFont, labelColor, "bold");
		defText.x = -halfW + 3 / worldScale;
		defText.y = curY;
		defText.maxWidth = cardW - 6 / worldScale;
		gfx.addChild(defText);
		curY += smallFont * 1.3;
	}

	if (pn.data.bodyPreview) {
		const previewText = createCardText(pn.data.bodyPreview, smallFont, labelColor, "normal", "italic");
		previewText.x = -halfW + 3 / worldScale;
		previewText.y = curY;
		previewText.maxWidth = cardW - 6 / worldScale;
		previewText.alpha = crc.cardBodyPreviewAlpha;
		gfx.addChild(previewText);
	}
}
