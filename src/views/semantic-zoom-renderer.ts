/**
 * Semantic zoom rendering — per-node LOD based on screen-space size.
 * Extracted from RenderPipeline._renderSemanticZoomMode.
 *
 * Tiers:
 *   1. Colored dot  (screenPx < dotPx)
 *   2. Circle+label (screenPx < compactPx)
 *   3. Compact card (screenPx < fullPx)
 *   4. Full card    (screenPx >= fullPx)
 */

import type { CanvasGraphics } from "./canvas2d";
import type { PixiNode } from "./InteractionManager";
import type { ShapeRule } from "../utils/node-shapes";
import { getNodeShape, drawShapeAt } from "../utils/node-shapes";
import { darkenColor } from "./render-pipeline-utils";
import { contrastColor } from "../utils/color";
import { truncateLabel, type RenderHost } from "./RenderPipeline";
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
} from "./card-renderer";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render nodes using semantic zoom: each node's LOD tier is determined by
 * its screen-space pixel size (effR * 2 * worldScale).
 */
export function renderSemanticZoomMode(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: {
		visible: PixiNode[];
		pixiNodes: Map<string, PixiNode>;
		tlFilteredOut: Set<string> | null;
		alpha: number;
		nodeCount: number;
		shapeRules: ShapeRule[];
		worldScale: number;
		minWorldRadius: number;
	},
	crc: Record<string, number>,
	rt: Record<string, number | boolean | string>,
): void {
	const { visible, tlFilteredOut, alpha, shapeRules, worldScale, minWorldRadius } = ctx;
	const dotPx = rt.semanticZoomDotPx as number;
	const compactPx = rt.semanticZoomCompactPx as number;
	const fullPx = rt.semanticZoomFullPx as number;
	const defField = host.getDefinitionField?.() ?? "";
	const hcSem = host.isHighContrastMode?.() ? 2 : 1;
	const labelColor = host.getLabelColor();

	for (const pn of visible) {
		const effR = Math.max(pn.radius, minWorldRadius);
		const screenPx = effR * 2 * worldScale;
		const nodeAlpha =
			tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * (crc.filteredNodeAlpha as number) : alpha;

		if (screenPx < dotPx) {
			// Tier 1: colored dot
			const dotSize = 1 / worldScale;
			g.lineStyle(0);
			g.beginFill(pn.color, nodeAlpha);
			g.drawRect(pn.data.x - dotSize / 2, pn.data.y - dotSize / 2, dotSize, dotSize);
			g.endFill();
		} else if (screenPx < compactPx) {
			// Tier 2: circle + label
			const shape = getNodeShape(pn.data, shapeRules);
			const strokeColor = darkenColor(pn.color, crc.strokeDarken as number);
			g.lineStyle(hcSem, strokeColor, nodeAlpha * (crc.strokeAlpha as number));
			g.beginFill(pn.color, nodeAlpha);
			drawShapeAt(g, shape, pn.data.x, pn.data.y, effR);
			g.endFill();
		} else if (screenPx < fullPx) {
			// Tier 3: compact card (name + definition field)
			_renderCompactCard(g, pn, effR, worldScale, nodeAlpha, crc, rt, defField, hcSem, labelColor);
		} else {
			// Tier 4: full card (name + definition + bodyPreview)
			_renderFullCard(g, pn, effR, worldScale, nodeAlpha, crc, rt, defField, hcSem, labelColor);
		}
	}
}

// ---------------------------------------------------------------------------
// Tier 3: Compact card
// ---------------------------------------------------------------------------

function _renderCompactCard(
	g: CanvasGraphics,
	pn: PixiNode,
	effR: number,
	worldScale: number,
	nodeAlpha: number,
	crc: Record<string, number>,
	rt: Record<string, number | boolean | string>,
	defField: string,
	hcSem: number,
	labelColor: number,
): void {
	const cardW = effR * 4;
	const cardH = effR * 2;
	const halfW = cardW / 2;
	const halfH = cardH / 2;
	const strokeColor = darkenColor(pn.color, crc.strokeDarken as number);
	g.lineStyle(hcSem, strokeColor, nodeAlpha * (crc.strokeAlpha as number));
	g.beginFill(pn.color, nodeAlpha * (crc.semanticCardFillAlpha as number));
	g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 2 / worldScale);
	g.endFill();

	const gfx = pn.gfx;
	cleanupCardText(gfx);
	const fontSize = Math.min(
		Math.max(COMPACT_CARD_FONT_MIN, COMPACT_CARD_FONT_BASE / worldScale),
		COMPACT_CARD_FONT_BASE * CARD_SCALE_CAP,
	);
	const nameText = createCardText(
		truncateLabel(pn.data.label, rt.labelMaxChars as number),
		fontSize,
		labelColor,
		"bold",
	);
	nameText.x = -halfW + 2 / worldScale;
	nameText.y = -halfH + 2 / worldScale;
	nameText.maxWidth = cardW - 4 / worldScale;
	gfx.addChild(nameText);
	if (defField && pn.data.meta?.[defField]) {
		const defText = createCardText(String(pn.data.meta[defField]), fontSize * CARD_SUB_FONT_RATIO, labelColor);
		defText.x = -halfW + 2 / worldScale;
		defText.y = -halfH + fontSize * CARD_LINE_HEIGHT + 2 / worldScale;
		defText.maxWidth = cardW - 4 / worldScale;
		defText.alpha = crc.cardSubTextAlpha as number;
		gfx.addChild(defText);
	}
}

// ---------------------------------------------------------------------------
// Tier 4: Full card
// ---------------------------------------------------------------------------

function _renderFullCard(
	g: CanvasGraphics,
	pn: PixiNode,
	effR: number,
	worldScale: number,
	nodeAlpha: number,
	crc: Record<string, number>,
	rt: Record<string, number | boolean | string>,
	defField: string,
	hcSem: number,
	labelColor: number,
): void {
	const cardW = effR * 5;
	const cardH = effR * 3;
	const halfW = cardW / 2;
	const halfH = cardH / 2;
	const strokeColor = darkenColor(pn.color, crc.strokeDarken as number);
	g.lineStyle(hcSem, strokeColor, nodeAlpha * (crc.strokeAlpha as number));
	g.beginFill(pn.color, nodeAlpha * (crc.semanticCardFullFillAlpha as number));
	g.drawRoundedRect(pn.data.x - halfW, pn.data.y - halfH, cardW, cardH, 3 / worldScale);
	g.endFill();
	// Header bar
	const headerH = effR * (crc.semanticCardHeaderHeightRatio as number);
	g.beginFill(pn.color, nodeAlpha * (crc.semanticCardHeaderFillAlpha as number));
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
		truncateLabel(pn.data.label, rt.labelMaxChars as number),
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
		previewText.alpha = crc.cardBodyPreviewAlpha as number;
		gfx.addChild(previewText);
	}
}
