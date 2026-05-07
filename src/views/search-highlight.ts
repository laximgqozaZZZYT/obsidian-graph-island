/**
 * Pure-ish helpers for search-result highlight, pulse animation, and a11y
 * announcements. Extracted from GraphViewContainer to keep that file from
 * exceeding its line budget.
 *
 * - {@link drawSearchCardHalo} draws a rounded-rect halo onto a PixiNode's
 *   own `circle` graphics (mutates the graphics, but otherwise deterministic).
 * - {@link countSearchMatches} is fully pure.
 * - {@link formatSearchAnnouncement} is pure (delegates to i18n `t()` for
 *   localized strings, which itself is pure given a fixed locale).
 * - {@link applySearchPulse} mutates the node's `_searchPulsed` flag and
 *   transform; the timer is injected so callers can keep it in their
 *   ManagedTimers pool.
 */
import type { PixiNode } from "./InteractionManager";
import type { CardRenderConfig } from "../types";
import { DEFAULT_CARD_RENDER_CONFIG } from "../types";
import {
	GVC_SEARCH_HALO_STROKE_WIDTH as SEARCH_HALO_STROKE_WIDTH,
	GVC_SEARCH_HALO_STROKE_ALPHA as SEARCH_HALO_STROKE_ALPHA,
	GVC_SEARCH_PULSE_MS as SEARCH_PULSE_MS,
	GVC_SEARCH_PULSE_SCALE as SEARCH_PULSE_SCALE,
	GVC_GOLDEN_RATIO_FALLBACK as GOLDEN_RATIO_FALLBACK,
} from "../constants";
import { t } from "../i18n";

/** Faint-fill alpha for the inner rounded-rect of a card-mode search halo. */
const CARD_HALO_FILL_ALPHA = 0.1;
/** Outset (px) of the halo stroke from the card body. */
const CARD_HALO_OUTSET_PX = 4;
/** Floor for halo half-width (px) — protects very narrow cards from a sub-visible halo. */
const CARD_HALO_MIN_HALF_WIDTH_PX = 20;
/** Default card corner radius when `cardCornerRadius` is unset. */
const CARD_HALO_DEFAULT_CORNER_PX = 6;

/**
 * Draw a card-mode search halo (faint fill + outline) onto the node's `circle`
 * graphics. Caller is responsible for clearing/resetting the graphics first.
 */
export function drawSearchCardHalo(pn: PixiNode, searchHitColor: number, cardConfig?: Partial<CardRenderConfig>): void {
	const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(cardConfig ?? {}) };
	const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : GOLDEN_RATIO_FALLBACK;
	const baseH = pn.radius * 2;
	const halfH = baseH;
	const halfW = Math.max(CARD_HALO_MIN_HALF_WIDTH_PX, (baseH * cardAR) / 2);
	const outset = CARD_HALO_OUTSET_PX;
	const cr = crc.cardCornerRadius ?? CARD_HALO_DEFAULT_CORNER_PX;
	pn.circle.beginFill(searchHitColor, CARD_HALO_FILL_ALPHA);
	pn.circle.drawRoundedRect(-halfW - outset, -halfH - outset, (halfW + outset) * 2, (halfH + outset) * 2, cr);
	pn.circle.endFill();
	pn.circle.lineStyle(SEARCH_HALO_STROKE_WIDTH, searchHitColor, SEARCH_HALO_STROKE_ALPHA);
	pn.circle.drawRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, cr);
}

/**
 * Count nodes that satisfy both the hop filter and the text-highlight filter.
 * `null` for either filter means "no filter" (matches everything).
 */
export function countSearchMatches(
	pixiNodes: Iterable<PixiNode>,
	hopSet: Set<string> | null,
	hlSet: Set<string> | null,
): number {
	let n = 0;
	for (const pn of pixiNodes) {
		const hopOk = hopSet === null || hopSet.has(pn.data.id);
		const textOk = !hlSet || hlSet.has(pn.data.id);
		if (hopOk && textOk) n++;
	}
	return n;
}

/**
 * Build the screen-reader announcement string for the current search state.
 * Returns `null` when no announcement is needed (e.g. a cleared filter that
 * was already empty before).
 *
 * - When a filter is active: `"Filter: <m> / <total> nodes"`.
 * - When the filter input was cleared (raw is whitespace): `"Filter cleared"`.
 * - Otherwise (no filter, non-empty raw): `null`.
 */
export function formatSearchAnnouncement(
	raw: string,
	hasHighlight: boolean,
	matchCount: number,
	total: number,
): string | null {
	if (hasHighlight) {
		return `${t("a11y.filterResult") ?? "Filter"}: ${matchCount} / ${total} ${t("a11y.nodesVisible") ?? "nodes"}`;
	}
	if (!raw.trim()) {
		return t("a11y.filterCleared") ?? "Filter cleared";
	}
	return null;
}

/**
 * Apply a brief scale-bounce pulse to the matched node. Honors
 * `prefers-reduced-motion`: when reduced motion is requested, the
 * `_searchPulsed` flag is still set (so subsequent calls are no-ops) but no
 * transform animation runs. The timer is injected via `scheduleTimer` so the
 * caller can route it through its own ManagedTimers pool.
 */
export function applySearchPulse(
	pn: PixiNode,
	hlSet: Set<string> | null,
	scheduleTimer: (cb: () => void, ms: number) => void,
): void {
	if (!hlSet || pn._searchPulsed) return;
	pn._searchPulsed = true;
	const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
	if (reducedMotion) return;
	const sx = pn.gfx.scale.x;
	pn.gfx.scale.set(sx * SEARCH_PULSE_SCALE);
	scheduleTimer(() => {
		if (pn.gfx) pn.gfx.scale.set(sx);
	}, SEARCH_PULSE_MS);
}
