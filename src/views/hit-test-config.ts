/**
 * Pure helper for computing hit-test geometry config.
 * Extracted from GraphViewContainer._prepareHitTestConfig to reduce complexity
 * and shrink the GVC god object.
 */
import type { CardDisplayConfig, CardRenderConfig, NodeDisplayMode, RenderThresholds } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG, mergeRenderThresholds } from "../types";
import { GVC_GOLDEN_RATIO_FALLBACK } from "../constants";
import { MIN_WORLD_RADIUS_PX } from "./RenderPipeline";

/** Inputs needed to compute hit-test geometry. */
export interface HitTestConfigInput {
	renderThresholds?: RenderThresholds;
	nodeDisplayMode?: NodeDisplayMode;
	cardRenderConfig?: CardRenderConfig;
	cardDisplayConfig?: CardDisplayConfig;
	definitionField?: string;
	zoom: number;
}

/** Output shape consumed by hit-test logic. */
export interface HitTestConfig {
	zoom: number;
	minWorldRadius: number;
	pad: number;
	displayMode: NodeDisplayMode;
	glowRadius: number;
	hitScreenPx: number;
	hitWorldR: number;
	hitCardMaxHalfW: number;
	hitCardAR: number;
	hitCardWidthFactor: number;
	hitCardAspectRatio: number;
	hitCardHalfH: number;
}

/** Compute card half-height for hit testing — depends on headerStyle. */
function computeCardHalfH(
	crc: Required<Pick<CardRenderConfig, "fieldLineHeight" | "tableHeaderHeight" | "cardPadding" | "plainCardHeight">>,
	cardConfig: CardDisplayConfig,
	definitionField: string,
	zoom: number,
): number {
	const fieldLineH = crc.fieldLineHeight / zoom;
	const fieldsLen = cardConfig.fields?.length ?? 0;
	if ((cardConfig.headerStyle ?? "plain") === "table") {
		const headerH = crc.tableHeaderHeight / zoom;
		const cardPad = crc.cardPadding / zoom;
		const hasDefField = definitionField.length > 0 ? 1 : 0;
		const hasPreview = 1; // bodyPreview row
		const fieldCount = fieldsLen + hasDefField + hasPreview;
		return (headerH + fieldCount * fieldLineH + cardPad * 2) / 2;
	}
	const plainH = crc.plainCardHeight / zoom;
	const metaH = fieldsLen * fieldLineH;
	return (plainH + metaH) / 2;
}

/** Build the full hit-test config from panel state + zoom. Pure function. */
export function prepareHitTestConfig(input: HitTestConfigInput): HitTestConfig {
	const rt = mergeRenderThresholds(input.renderThresholds);
	const { zoom } = input;
	const pad = rt.collisionPadding;
	const displayMode = input.nodeDisplayMode ?? "node";
	const glowRadius = rt.glowBaseRadius;
	const hitScreenPx = Math.max(MIN_WORLD_RADIUS_PX * glowRadius, rt.minHoverScreenPx);

	const base: HitTestConfig = {
		zoom,
		minWorldRadius: Math.max(0, MIN_WORLD_RADIUS_PX / zoom),
		pad,
		displayMode,
		glowRadius,
		hitScreenPx,
		hitWorldR: hitScreenPx / zoom + pad,
		hitCardMaxHalfW: 0,
		hitCardAR: 0,
		hitCardWidthFactor: 0,
		hitCardAspectRatio: 0,
		hitCardHalfH: 0,
	};

	if (displayMode !== "card") return base;

	const crc = {
		...DEFAULT_CARD_RENDER_CONFIG,
		...(input.cardRenderConfig ?? {}),
	} as Required<CardRenderConfig>;
	const cardConfig: CardDisplayConfig = input.cardDisplayConfig ?? {
		fields: [],
		maxWidth: 120,
		showIcon: false,
	};
	const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : GVC_GOLDEN_RATIO_FALLBACK;

	return {
		...base,
		hitCardMaxHalfW: (cardConfig.maxWidth ?? 120) / zoom / 2,
		hitCardAR: cardAR,
		hitCardWidthFactor: crc.cardWidthFactor,
		hitCardAspectRatio: crc.cardAspectRatio,
		hitCardHalfH: computeCardHalfH(crc, cardConfig, input.definitionField ?? "", zoom),
	};
}
