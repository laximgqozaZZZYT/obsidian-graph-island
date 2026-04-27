/**
 * panel-sections-filter-logic.ts
 *
 * Pure (DOM-independent) helpers extracted from `panel-sections-filter.ts`.
 * Covers input normalization, card-preset application, visibility gates,
 * and small collection mutations used by the display-tab section builders.
 *
 * Kept free of Obsidian / DOM imports so unit tests can exercise them
 * directly without `tests/__mocks__/obsidian.ts`.
 */
import type { CardDisplayConfig, NodeDisplayMode } from "../types";

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

/** Parse a comma-separated field list into a trimmed, non-empty array. */
export function normalizeCardFields(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Trim a free-form definition field name. */
export function normalizeDefinitionField(raw: string): string {
	return raw.trim();
}

/**
 * Trim a donut breakdown field; empty string collapses to `undefined`
 * so the renderer falls back to its default breakdown logic.
 */
export function normalizeDonutBreakdownField(raw: string): string | undefined {
	return raw.trim() || undefined;
}

// ---------------------------------------------------------------------------
// Card preset application
// ---------------------------------------------------------------------------

type CardPreset = NonNullable<CardDisplayConfig["preset"]>;

/**
 * Return a new `CardDisplayConfig` with preset-specific defaults merged on top
 * of the existing config. `"custom"` leaves user values untouched.
 */
export function applyCardPreset(config: CardDisplayConfig, preset: CardPreset): CardDisplayConfig {
	if (preset === "compact") {
		return {
			...config,
			preset: "compact",
			fields: [],
			maxWidth: 80,
			showIcon: false,
			headerStyle: "plain",
		};
	}
	if (preset === "detailed") {
		return {
			...config,
			preset: "detailed",
			fields: ["category"],
			maxWidth: 150,
			showIcon: true,
			headerStyle: "table",
		};
	}
	if (preset === "full") {
		return {
			...config,
			preset: "full",
			fields: ["category", "node_type", "tags"],
			maxWidth: 200,
			showIcon: true,
			headerStyle: "table",
		};
	}
	return { ...config, preset: "custom" };
}

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

/** Cable sub-settings are shown for all bundle modes except `"never"`. */
export function shouldShowCableSubSettings(mode: "auto" | "always" | "never"): boolean {
	return mode !== "never";
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

export function shouldShowHierarchyBreadcrumb(panel: { localGraphCenter?: string | null }): boolean {
	return panel.localGraphCenter != null;
}

export function shouldShowApplyEgoButton(panel: {
	focusNodeId?: string | null;
	localGraphCenter?: string | null;
}): boolean {
	return Boolean(panel.focusNodeId || panel.localGraphCenter);
}

export function shouldShowMultiSelectSection(panel: { multiSelectNodeIds?: readonly string[] }): boolean {
	return (panel.multiSelectNodeIds?.length ?? 0) > 0;
}

export function shouldShowRoadSubSettings(rt: { showRoadNetwork?: boolean }): boolean {
	return !!rt.showRoadNetwork;
}

export function shouldShowRelationColorSection(
	panel: { colorEdgesByRelation?: boolean },
	ctx: { relationColors: { size: number } },
): boolean {
	return !!panel.colorEdgesByRelation && ctx.relationColors.size > 0;
}

export function shouldShowViewportList(panel: { savedViewports?: readonly unknown[] }): boolean {
	return Array.isArray(panel.savedViewports) && panel.savedViewports.length > 0;
}

export function shouldShowThumbnailToggle(ctx: { hasImageMetaNodes?: boolean }): boolean {
	return !!ctx.hasImageMetaNodes;
}

export function shouldShowHierarchyTree(ctx: { hasInheritanceEdges?: boolean }): boolean {
	return !!ctx.hasInheritanceEdges;
}

export function shouldShowOntologyBackbone(settings: { ontology?: { rules?: readonly unknown[] } }): boolean {
	return (settings.ontology?.rules?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Hover highlight defaults
// ---------------------------------------------------------------------------

interface HoverHighlightTypes {
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

/** Count how many hover highlight categories are active. */
export function countActiveHoverHighlights(types: Partial<HoverHighlightTypes> | undefined): number {
	if (!types) return 0;
	let n = 0;
	if (types.forwardLinks) n++;
	if (types.backlinks) n++;
	if (types.sharedTags) n++;
	if (types.sameFolder) n++;
	return n;
}

// ---------------------------------------------------------------------------
// Collection mutations (pure)
// ---------------------------------------------------------------------------

/** Return a new array with `id` removed (idempotent if absent). */
export function removeBookmark(bookmarks: readonly string[], id: string): string[] {
	return bookmarks.filter((b) => b !== id);
}

/** Return a new array with the `target` reference removed. */
export function removeViewport<T>(viewports: readonly T[], target: T): T[] {
	return viewports.filter((v) => v !== target);
}
