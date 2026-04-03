/**
 * Card rendering functions extracted from RenderPipeline.
 * Handles table-card and plain-card display modes.
 */
import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { CardDisplayConfig } from "../types";
import type { PixiNode } from "./InteractionManager";
import { contrastColor } from "../utils/color";
import { darkenColor, truncateLabel } from "./RenderPipeline";
import type { RenderHost } from "./RenderPipeline";

// ---------------------------------------------------------------------------
// CardText — CanvasText with a marker flag for card-mode text children
// ---------------------------------------------------------------------------

/** CanvasText child that belongs to a card-mode node (header or field row). */
interface CardText extends CanvasText {
	_isCardText: true;
}

/** Type guard: is the given canvas child a CardText? */
export function isCardText(obj: unknown): obj is CardText {
	return obj instanceof CanvasText && (obj as CardText)._isCardText === true;
}

/** Mark a CanvasText as card text and return it typed as CardText. */
export function markAsCardText(t: CanvasText): CardText {
	(t as CardText)._isCardText = true;
	return t as CardText;
}

/** Font family for card text */
export const CARD_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, sans-serif";

/** Create a CanvasText marked as card text. */
export function createCardText(
	str: string,
	fontSize: number,
	fill: number,
	weight: "normal" | "bold" = "normal",
	style: "normal" | "italic" = "normal",
): CardText {
	const t = new CanvasText(str, {
		fontSize,
		fill,
		fontWeight: weight,
		fontStyle: style,
		fontFamily: CARD_FONT_FAMILY,
	});
	return markAsCardText(t);
}

// ---------------------------------------------------------------------------
// Card-specific constants
// ---------------------------------------------------------------------------

/** Maximum counter-scale factor for card mode (prevents enormous cards at extreme zoom-out) */
export const CARD_SCALE_CAP = 8;

/** Card icon size ratio relative to header height */
const CARD_ICON_SIZE_RATIO = 0.55;
/** Card icon fold triangle ratio relative to icon size */
const CARD_ICON_FOLD_RATIO = 0.28;
/** Card icon outline stroke alpha */
const CARD_ICON_OUTLINE_ALPHA = 0.7;
/** Card icon body fill alpha */
const CARD_ICON_FILL_ALPHA = 0.25;
/** Card icon fold fill alpha */
const CARD_ICON_FOLD_ALPHA = 0.15;

/** Plain card title font minimum size (px) */
const PLAIN_CARD_TITLE_FONT_MIN = 3;
/** Plain card body font minimum size (px) */
const PLAIN_CARD_BODY_FONT_MIN = 2;
/** Plain card internal padding (px, scaled by worldScale) */
const PLAIN_CARD_PAD = 4;
/** Plain card body line height multiplier */
const PLAIN_CARD_BODY_LINE_HEIGHT = 1.4;

/** Semantic-zoom full card font sizes (tier 4 = name + definition + preview) */
export const FULL_CARD_FONT_BASE = 10;
export const FULL_CARD_FONT_MIN = 7;

/** Line height multiplier for card text (vertical spacing between lines) */
export const CARD_LINE_HEIGHT = 1.3;

/** Ratio of sub-field font to header font in semantic-zoom cards */
export const CARD_SUB_FONT_RATIO = 0.85;

// Semantic-zoom compact card font sizes (tier 3 = compact labels)
export const COMPACT_CARD_FONT_MIN = 6;
export const COMPACT_CARD_FONT_BASE = 9;

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Remove CardText children from a single node's gfx container. */
export function cleanupCardText(gfx: CanvasContainer): void {
	for (let ci = gfx.children.length - 1; ci >= 0; ci--) {
		if (isCardText(gfx.children[ci])) {
			const child = gfx.children[ci];
			gfx.removeChild(child);
			child.destroy();
		}
	}
}

/** Remove all CardText children from every node's gfx container. */
export function cleanupCardTextAll(pixiNodes: Map<string, PixiNode>): void {
	for (const pn of pixiNodes.values()) {
		cleanupCardText(pn.gfx);
	}
}

// ---------------------------------------------------------------------------
// Card rendering functions
// ---------------------------------------------------------------------------

/** Card display mode: dispatch to table or plain card style. */
export function renderCardMode(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: {
		visible: PixiNode[];
		pixiNodes: Map<string, PixiNode>;
		tlFilteredOut: Set<string> | null;
		alpha: number;
		nodeCount: number;
		worldScale: number;
		minWorldRadius: number;
	},
	crc: ReturnType<typeof Object.assign>,
	rt: ReturnType<typeof Object.assign>,
): void {
	const { pixiNodes, worldScale } = ctx;
	const cardConfig = host.getCardDisplayConfig();
	const headerStyle = cardConfig.headerStyle ?? "plain";
	const cardMaxW = (cardConfig.maxWidth ?? 200) / worldScale;
	const showIcon = cardConfig.showIcon === true;

	// Clean up previous card text children from ALL nodes
	cleanupCardTextAll(pixiNodes);

	if (headerStyle === "table") {
		renderTableCard(host, g, ctx, crc, rt, cardConfig, cardMaxW, showIcon);
	} else {
		renderPlainCard(host, g, ctx, crc, rt, cardConfig, cardMaxW);
	}
}

/** Render file icon inside a table card header. */
function renderCardIcon(
	g: CanvasGraphics,
	cardX: number,
	cardY: number,
	headerH: number,
	pad: number,
	worldScale: number,
	nodeAlpha: number,
): void {
	const iconS = headerH * CARD_ICON_SIZE_RATIO;
	const foldS = iconS * CARD_ICON_FOLD_RATIO;
	const iconX = cardX + pad;
	const iconY = cardY + (headerH - iconS) / 2;
	// Page body outline
	g.lineStyle(0.5 / worldScale, 0xffffff, nodeAlpha * CARD_ICON_OUTLINE_ALPHA);
	g.beginFill(0xffffff, nodeAlpha * CARD_ICON_FILL_ALPHA);
	g.moveTo(iconX, iconY);
	g.lineTo(iconX + iconS - foldS, iconY);
	g.lineTo(iconX + iconS, iconY + foldS);
	g.lineTo(iconX + iconS, iconY + iconS);
	g.lineTo(iconX, iconY + iconS);
	g.closePath();
	g.endFill();
	// Fold triangle
	g.lineStyle(0);
	g.beginFill(0xffffff, nodeAlpha * CARD_ICON_FOLD_ALPHA);
	g.moveTo(iconX + iconS - foldS, iconY);
	g.lineTo(iconX + iconS - foldS, iconY + foldS);
	g.lineTo(iconX + iconS, iconY + foldS);
	g.closePath();
	g.endFill();
}

/** Render text labels for table cards: header + body text (no frontmatter). */
function renderTableCardText(
	host: RenderHost,
	tableCardNodes: PixiNode[],
	crc: ReturnType<typeof Object.assign>,
	rt: ReturnType<typeof Object.assign>,
	cardConfig: CardDisplayConfig,
	cardMaxW: number,
	showIcon: boolean,
	headerH: number,
	bodyLineH: number,
	pad: number,
	_totalH: number,
	_arHalfW: number,
	worldScale: number,
	minWorldRadius: number,
): void {
	const labelColor = host.getLabelColor();
	const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;

	for (const pn of tableCardNodes) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime card dimension cache
		const totalH = (pn as any)._cardTotalH ?? headerH + bodyLineH + pad * 2;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const bodyLines = (pn as any)._cardBodyLines ?? 0;
		const arHalfW = (totalH * cardAR) / 2;
		const effR = Math.max(pn.radius, minWorldRadius);
		const MIN_CARD_HALF_W_TEXT = Math.min(20 / worldScale, 20 * CARD_SCALE_CAP);
		const halfW = Math.max(
			MIN_CARD_HALF_W_TEXT,
			Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor),
		);
		const cardY = -totalH / 2;
		const textPadX = pad;
		const fontSize = Math.min(
			Math.max(crc.headerFontSizeMin, crc.headerFontSizeBase / worldScale),
			crc.headerFontSizeBase * CARD_SCALE_CAP,
		);
		const smallFontSize = Math.min(
			Math.max(crc.fieldFontSizeMin, crc.fieldFontSizeBase / worldScale),
			crc.fieldFontSizeBase * CARD_SCALE_CAP,
		);
		const gfx = pn.gfx;

		const iconOffset = showIcon ? headerH * CARD_ICON_SIZE_RATIO + pad : 0;
		const availableTextW = halfW * 2 - textPadX * 2 - iconOffset;

		// Header text (bold, contrasting color)
		const headerText = createCardText(
			truncateLabel(pn.data.label, rt.labelMaxChars),
			fontSize,
			contrastColor(pn.color),
			"bold",
		);
		headerText.x = -halfW + textPadX + iconOffset;
		headerText.y = cardY + headerH / 2 + fontSize * crc.fontBaselineOffset;
		if (rt.cardTextTruncation !== false) headerText.maxWidth = availableTextW;
		gfx.addChild(headerText);

		// Body text (wrap into multiple lines)
		if (bodyLines > 0 && pn.data.bodyPreview) {
			const body = pn.data.bodyPreview;
			const charPerLine = Math.max(10, Math.floor(availableTextW / (smallFontSize * 0.6)));
			for (let li = 0; li < bodyLines; li++) {
				const lineText = body.substring(li * charPerLine, (li + 1) * charPerLine);
				if (!lineText) break;
				const bodyLine = createCardText(lineText, smallFontSize, labelColor);
				bodyLine.x = -halfW + textPadX;
				bodyLine.y =
					cardY + headerH + li * bodyLineH + bodyLineH / 2 + smallFontSize * crc.fontBaselineOffset;
				bodyLine.alpha = 0.85;
				if (rt.cardTextTruncation !== false) bodyLine.maxWidth = availableTextW;
				gfx.addChild(bodyLine);
			}
		}
	}
}

/** Table (ER-diagram) card style rendering. */
function renderTableCard(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: {
		visible: PixiNode[];
		tlFilteredOut: Set<string> | null;
		alpha: number;
		nodeCount: number;
		worldScale: number;
		minWorldRadius: number;
	},
	crc: ReturnType<typeof Object.assign>,
	rt: ReturnType<typeof Object.assign>,
	cardConfig: CardDisplayConfig,
	cardMaxW: number,
	showIcon: boolean,
): void {
	const { visible, tlFilteredOut, alpha, nodeCount, worldScale, minWorldRadius } = ctx;
	// Cap card counter-scale to prevent cards from becoming enormous at extreme zoom-out
	const cardScale = Math.min(1 / worldScale, CARD_SCALE_CAP);
	// Sync font size cap with cardScale to prevent text overflow
	const _cardFontScaleCap = CARD_SCALE_CAP * worldScale; // effective 1/worldScale capped
	const headerH = crc.tableHeaderHeight * cardScale;
	const fieldLineH = crc.fieldLineHeight * cardScale;
	const pad = crc.cardPadding * cardScale;
	const cornerR = crc.cardCornerRadius * cardScale;
	// Card content: show body text instead of frontmatter fields.
	// Body line count varies per node — use max for uniform card sizing,
	// but cap to prevent enormous cards.
	const MAX_BODY_LINES = 4;
	const bodyLineH = fieldLineH;
	// Compute per-node body line count for variable card height
	const defaultBodyLines = 1; // minimum: 1 line for nodes without body

	const tableCardNodes: PixiNode[] = [];
	const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;

	for (const pn of visible) {
		const effR = Math.max(pn.radius, minWorldRadius);
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;

		// Body-driven card height: count body lines from bodyPreview
		const bodyText = pn.data.bodyPreview ?? "";
		const charPerLine = 25; // approximate chars per line at card width
		const rawLines = bodyText.length > 0 ? Math.ceil(bodyText.length / charPerLine) : 0;
		const bodyLines = Math.min(rawLines, MAX_BODY_LINES);
		const totalH = headerH + Math.max(defaultBodyLines, bodyLines) * bodyLineH + pad * 2;

		const arHalfW = (totalH * cardAR) / 2;
		const MIN_CARD_HALF_W = Math.min(20 / worldScale, 20 * CARD_SCALE_CAP);
		const halfW = Math.max(
			MIN_CARD_HALF_W,
			Math.min(cardMaxW / 2, crc.cardAspectRatio > 0 ? arHalfW : effR * crc.cardWidthFactor),
		);
		const cardW = halfW * 2;
		const cardX = pn.data.x - halfW;
		const cardY = pn.data.y - totalH / 2;

		// 0. Drop shadow
		if (crc.cardShadowAlpha > 0) {
			const shadowOff = crc.cardShadowOffset / worldScale;
			g.lineStyle(0);
			g.beginFill(0x000000, nodeAlpha * crc.cardShadowAlpha);
			g.drawRoundedRect(cardX + shadowOff, cardY + shadowOff, cardW, totalH, cornerR);
			g.endFill();
		}

		// 1. Card background
		g.lineStyle(0);
		g.beginFill(pn.color, nodeAlpha * crc.cardBackgroundAlpha);
		g.drawRoundedRect(cardX, cardY, cardW, totalH, cornerR);
		g.endFill();

		// 2. Header region (colored bar at top)
		g.beginFill(pn.color, nodeAlpha * crc.cardHeaderAlpha);
		g.drawRoundedRect(cardX, cardY, cardW, headerH + cornerR, cornerR);
		g.endFill();
		g.beginFill(pn.color, nodeAlpha * crc.cardHeaderAlpha);
		g.drawRect(cardX, cardY + headerH, cardW, cornerR);
		g.endFill();

		// 2b. File icon
		if (showIcon) {
			renderCardIcon(g, cardX, cardY, headerH, pad, worldScale, nodeAlpha);
		}

		// 3. Divider line below header
		const divColor = darkenColor(pn.color, crc.cardDividerDarken);
		g.lineStyle(1 / worldScale, divColor, nodeAlpha * crc.cardDividerAlpha);
		g.moveTo(cardX, cardY + headerH);
		g.lineTo(cardX + cardW, cardY + headerH);

		// No striped field rows — body text fills this area instead

		// Outer border
		const hcTable = host.isHighContrastMode?.() ? 2 : 1;
		const strokeColor = darkenColor(pn.color, crc.strokeDarken);
		g.lineStyle(hcTable, strokeColor, nodeAlpha * crc.strokeAlpha);
		g.beginFill(0, 0);
		g.drawRoundedRect(cardX, cardY, cardW, totalH, cornerR);
		g.endFill();

		// Store computed dimensions for text pass
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime card dimension cache
		(pn as any)._cardTotalH = totalH;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(pn as any)._cardBodyLines = bodyLines;
		if (nodeCount < rt.cardTextNodeCount) tableCardNodes.push(pn);
	}

	// Text pass for table cards (only when node count < threshold)
	if (tableCardNodes.length > 0) {
		renderTableCardText(
			host,
			tableCardNodes,
			crc,
			rt,
			cardConfig,
			cardMaxW,
			showIcon,
			headerH,
			bodyLineH,
			pad,
			0 /* per-node */,
			0 /* per-node */,
			worldScale,
			minWorldRadius,
		);
	}
}

/** Plain card style rendering. */
function renderPlainCard(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: {
		visible: PixiNode[];
		tlFilteredOut: Set<string> | null;
		alpha: number;
		nodeCount: number;
		worldScale: number;
		minWorldRadius: number;
	},
	crc: ReturnType<typeof Object.assign>,
	rt: ReturnType<typeof Object.assign>,
	cardConfig: CardDisplayConfig,
	cardMaxW: number,
): void {
	const { visible, tlFilteredOut, alpha, nodeCount, worldScale, minWorldRadius } = ctx;
	const cardH = crc.plainCardHeight / worldScale;
	// IE: Card content respects hover checklist
	const panelMeta2 = host.getPanel?.()?.hoverShowMeta ?? true;
	const showMeta = panelMeta2 && nodeCount < rt.cardTextNodeCount && cardConfig.fields.length > 0;
	const fieldLineH = crc.fieldLineHeight / worldScale;

	// HM: Golden ratio for plain cards — compute width from height × AR
	const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;

	for (const pn of visible) {
		const _effR = Math.max(pn.radius, minWorldRadius);
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		const MIN_PLAIN_HALF_W = 20 / worldScale;
		// HM: Step 1 — estimate base height (title + optional meta)
		const baseH = showMeta ? cardH + cardConfig.fields.length * fieldLineH : cardH;
		// HM: Step 2 — golden ratio width from base height
		const arHalfW = (baseH * cardAR) / 2;
		const halfW = Math.max(MIN_PLAIN_HALF_W, Math.min(cardMaxW / 2, arHalfW));
		// FI: Dynamic card height based on body content (uses final width for line wrapping)
		// IP: Use cardBodyMaxLines (not hardcoded 3) for consistent card height
		const maxBodyLines = rt.cardBodyMaxLines;
		const bodyLines = pn.data.bodyPreview
			? Math.min(
					maxBodyLines,
					Math.ceil(
						pn.data.bodyPreview.length /
							Math.max(5, Math.floor((halfW * 2 - 8 / worldScale) / ((8 / worldScale) * 0.55))),
					),
				)
			: 0;
		const bodyExtraH = bodyLines * ((8 / worldScale) * 1.3);
		const totalH = baseH + bodyExtraH;
		const halfH = totalH / 2;

		// Card background (IK: high contrast mode doubles stroke width)
		const hcCard = host.isHighContrastMode?.() ? 2 : 1;
		const strokeColor = darkenColor(pn.color, crc.strokeDarken);
		g.lineStyle(hcCard, strokeColor, nodeAlpha * crc.plainCardStrokeAlpha);
		g.beginFill(pn.color, nodeAlpha * crc.plainCardFillAlpha);
		g.drawRoundedRect(
			pn.data.x - halfW,
			pn.data.y - halfH,
			halfW * 2,
			totalH,
			crc.cardCornerRadius / worldScale,
		);
		g.endFill();

		// FH/FI: Plain card with title + wrapped body preview
		{
			const fontSize = Math.min(
				Math.max(PLAIN_CARD_TITLE_FONT_MIN, FULL_CARD_FONT_BASE / worldScale),
				FULL_CARD_FONT_BASE * CARD_SCALE_CAP,
			);
			const bodyFontBase = rt.cardBodyFontSize;
			const smallFont = Math.min(
				Math.max(PLAIN_CARD_BODY_FONT_MIN, bodyFontBase / worldScale),
				bodyFontBase * CARD_SCALE_CAP,
			);
			const pad = Math.min(PLAIN_CARD_PAD / worldScale, PLAIN_CARD_PAD * CARD_SCALE_CAP);
			const textW = halfW * 2 - pad * 2;
			const lineH = smallFont * CARD_LINE_HEIGHT;
			// A11y: auto-select title/body text color for WCAG contrast against card background
			const titleFill = contrastColor(pn.color);
			const bodyFill = titleFill === 0xffffff ? 0xcccccc : 0x444444;
			// Title (apply GD labelMaxChars truncation)
			const title = createCardText(
				truncateLabel(pn.data.label, rt.labelMaxChars),
				fontSize,
				titleFill,
				"bold",
			);
			title.x = -halfW + pad;
			title.y = -halfH + pad;
			if (rt.cardTextTruncation !== false) title.maxWidth = textW;
			pn.gfx.addChild(title);
			// FH: Wrapped body preview — split into multiple lines
			// IE: Card content respects hoverShowBody checklist
			const cardShowBody = host.getPanel?.()?.hoverShowBody ?? true;
			if (pn.data.bodyPreview && cardShowBody) {
				const maxLines = rt.cardBodyMaxLines;
				const charsPerLine = Math.max(5, Math.floor(textW / (smallFont * 0.55)));
				const words = pn.data.bodyPreview.split(/\s+/);
				const lines: string[] = [];
				let cur = "";
				for (const w of words) {
					if (cur.length + w.length + 1 > charsPerLine) {
						lines.push(cur);
						cur = w;
						if (lines.length >= maxLines) break;
					} else {
						cur = cur ? cur + " " + w : w;
					}
				}
				if (cur && lines.length < maxLines) lines.push(cur);
				for (let li = 0; li < lines.length; li++) {
					const bodyLine = createCardText(lines[li], smallFont, bodyFill);
					bodyLine.x = -halfW + pad;
					bodyLine.y = -halfH + pad + fontSize * PLAIN_CARD_BODY_LINE_HEIGHT + li * lineH;
					bodyLine.alpha = crc.cardSubTextAlpha;
					if (rt.cardTextTruncation !== false) bodyLine.maxWidth = textW;
					pn.gfx.addChild(bodyLine);
				}
			}
		}
	}
}
