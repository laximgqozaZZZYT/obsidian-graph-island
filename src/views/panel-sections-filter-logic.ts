/**
 * panel-sections-filter-logic.ts
 *
 * Pure (DOM-independent) helpers extracted from `panel-sections-filter.ts`.
 * Covers input normalization and visibility gates used by the display-tab
 * section builders.
 *
 * Kept free of Obsidian / DOM imports so unit tests can exercise them
 * directly without `tests/__mocks__/obsidian.ts`.
 */
import type { CardDisplayConfig, NodeDisplayMode } from "../types";

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

/** Trim a free-form definition field name. */
export function normalizeDefinitionField(raw: string): string {
	return raw.trim();
}

// ---------------------------------------------------------------------------
// Card preset application
// ---------------------------------------------------------------------------

export type CardPreset = NonNullable<CardDisplayConfig["preset"]>;

// ---------------------------------------------------------------------------
// Visibility gates — tiny predicates that decide whether a sub-section
// should be rendered. Extracted so the mapping "state → visibility" is
// testable without any DOM setup.
// ---------------------------------------------------------------------------

export function shouldShowCardSubSettings(mode: NodeDisplayMode): boolean {
	return mode === "card";
}

export function shouldShowDonutSubSettings(mode: NodeDisplayMode): boolean {
	return mode === "donut";
}

export function shouldShowRecencySlider(panel: { showRecencyMarker?: boolean }): boolean {
	return !!panel.showRecencyMarker;
}

export function shouldShowImportanceMetric(panel: { showImportanceRing?: boolean }): boolean {
	return !!panel.showImportanceRing;
}

export function shouldShowClusterLabelDetail(panel: {
	showTagNodes?: boolean;
	tagDisplay?: "node" | "enclosure";
}): boolean {
	return !!panel.showTagNodes && panel.tagDisplay === "enclosure";
}

export function shouldShowFocusLayout(panel: { focusMode?: boolean }): boolean {
	return !!panel.focusMode;
}

export function shouldShowThumbnailToggle(ctx: { hasImageMetaNodes?: boolean }): boolean {
	return !!ctx.hasImageMetaNodes;
}

export function shouldShowOntologyBackbone(settings: { ontology?: { rules?: readonly unknown[] } }): boolean {
	return (settings.ontology?.rules?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Hover highlight defaults
// ---------------------------------------------------------------------------

export interface HoverHighlightTypes {
	forwardLinks: boolean;
	backlinks: boolean;
	sharedTags: boolean;
	sameFolder: boolean;
}

export const DEFAULT_HOVER_HIGHLIGHT_TYPES: HoverHighlightTypes = {
	forwardLinks: true,
	backlinks: true,
	sharedTags: false,
	sameFolder: false,
};

/** Return a fully-populated HoverHighlightTypes, falling back to defaults. */
export function ensureHoverHighlightTypes(current: Partial<HoverHighlightTypes> | undefined): HoverHighlightTypes {
	return { ...DEFAULT_HOVER_HIGHLIGHT_TYPES, ...(current ?? {}) };
}

// ---------------------------------------------------------------------------
// Collection mutations (pure)
// ---------------------------------------------------------------------------

/** Return a new array with `id` removed (idempotent if absent). */
export function removeBookmark(bookmarks: readonly string[], id: string): string[] {
	return bookmarks.filter((b) => b !== id);
}
