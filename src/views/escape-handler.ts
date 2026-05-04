// ---------------------------------------------------------------------------
// escape-handler — Escape key dismissal chain extracted from GVC
//
// Replaces the original linear if/return ladder (cyclomatic complexity ~21)
// with a data-driven chain of dismissal handlers. Each handler returns true
// when it dismissed something, halting the chain.
// ---------------------------------------------------------------------------
import { t } from "../i18n";

/** Minimal interface of GVC state/methods needed by the Escape dismissal chain. */
export interface EscapeContext {
	diffOverlay: { isActive(): boolean };
	clearDiffOverlay(): void;
	announceA11y(msg: string): void;

	nodeInfoEl: HTMLElement | null;
	graphStatsEl: HTMLElement | null;
	legendEl: HTMLElement | null;
	helpOverlayEl: HTMLElement | null;
	setHelpOverlayEl(el: HTMLElement | null): void;

	panel: {
		showGraphStats: boolean;
		multiSelectNodeIds?: string[];
		subgraphNodeIds?: string[];
		focusNodeId?: string | null;
		searchQuery?: string;
	};

	compareNodeIds: string[];
	clearCompareSelection(): void;

	exitSubgraph(): void;
	clearFocus(): void;

	clearSearchHighlightSet(): void;
	applySearch(): void;
	buildPanel(): void;

	isKeyboardFocused: boolean;
	setKeyboardFocused(v: boolean): void;
	setHighlightedNodeId(id: string | null): void;
	applyHover(): void;
	markDirty(force: boolean): void;
}

/** A dismissal returns true when it handled the Escape press, false to skip. */
type Dismissal = (ctx: EscapeContext) => boolean;

const dismissDiffOverlay: Dismissal = (ctx) => {
	if (!ctx.diffOverlay.isActive()) return false;
	ctx.clearDiffOverlay();
	ctx.announceA11y("Diff overlay closed");
	return true;
};

const dismissNodeInfo: Dismissal = (ctx) => {
	const el = ctx.nodeInfoEl;
	if (!el || el.style.display === "none") return false;
	el.style.display = "none";
	el.classList.remove("is-visible");
	ctx.announceA11y("Node info closed");
	return true;
};

const dismissStatsPanel: Dismissal = (ctx) => {
	const el = ctx.graphStatsEl;
	if (!el || el.style.display === "none" || !ctx.panel.showGraphStats) return false;
	ctx.panel.showGraphStats = false;
	el.style.display = "none";
	ctx.announceA11y("Stats panel closed");
	return true;
};

const dismissLegend: Dismissal = (ctx) => {
	const el = ctx.legendEl;
	if (!el || el.style.display === "none") return false;
	el.style.display = "none";
	ctx.announceA11y("Legend closed");
	return true;
};

const dismissHelpOverlay: Dismissal = (ctx) => {
	const el = ctx.helpOverlayEl;
	if (!el) return false;
	el.remove();
	ctx.setHelpOverlayEl(null);
	ctx.announceA11y("Help closed");
	return true;
};

const dismissCompareSelection: Dismissal = (ctx) => {
	if (ctx.compareNodeIds.length === 0) return false;
	ctx.clearCompareSelection();
	ctx.announceA11y(t("a11y.compareCleared") ?? "Compare selection cleared");
	return true;
};

const dismissMultiSelect: Dismissal = (ctx) => {
	const ids = ctx.panel.multiSelectNodeIds;
	if (!ids || ids.length === 0) return false;
	ctx.panel.multiSelectNodeIds = [];
	ctx.announceA11y(t("a11y.deselected") ?? "Deselected all");
	ctx.markDirty(true);
	return true;
};

const dismissSubgraph: Dismissal = (ctx) => {
	const ids = ctx.panel.subgraphNodeIds;
	if (!ids || ids.length === 0) return false;
	ctx.exitSubgraph();
	return true;
};

const dismissFocus: Dismissal = (ctx) => {
	if (!ctx.panel.focusNodeId) return false;
	ctx.clearFocus();
	ctx.announceA11y("Focus mode cleared");
	return true;
};

const dismissSearch: Dismissal = (ctx) => {
	if (!ctx.panel.searchQuery) return false;
	ctx.panel.searchQuery = "";
	ctx.clearSearchHighlightSet();
	ctx.applySearch();
	ctx.announceA11y(t("a11y.filterCleared") ?? "Search cleared");
	ctx.buildPanel();
	return true;
};

const dismissKeyboardFocus: Dismissal = (ctx) => {
	if (!ctx.isKeyboardFocused) return false;
	ctx.setKeyboardFocused(false);
	ctx.setHighlightedNodeId(null);
	ctx.applyHover();
	ctx.markDirty(true);
	ctx.announceA11y("Keyboard focus cleared");
	return true;
};

/**
 * Ordered Escape-key dismissal chain. Each handler claims one piece of UI to
 * dismiss; first to return true wins. Order is intentional — later items are
 * "deeper" state that should only clear once nothing more transient is open.
 */
const ESCAPE_CHAIN: Dismissal[] = [
	dismissDiffOverlay,
	dismissNodeInfo,
	dismissStatsPanel,
	dismissLegend,
	dismissHelpOverlay,
	dismissCompareSelection,
	dismissMultiSelect,
	dismissSubgraph,
	dismissFocus,
	dismissSearch,
	dismissKeyboardFocus,
];

/** Walk the dismissal chain; the first handler that fires owns the Escape press. */
export function handleEscapeKey(ctx: EscapeContext): void {
	for (const dismiss of ESCAPE_CHAIN) {
		if (dismiss(ctx)) return;
	}
}
