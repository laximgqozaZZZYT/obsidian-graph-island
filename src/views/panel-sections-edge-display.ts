/**
 * panel-sections-edge-display.ts
 *
 * Edge-display sub-section builders extracted from
 * panel-sections-display.ts:buildEdgeDisplaySection to reduce function size.
 *
 * Each helper appends UI controls to the supplied `parent` element. The
 * caller (buildEdgeDisplaySection) decides whether to pass the basic body
 * or the advanced (collapsed) container.
 */
import { mergeRenderThresholds } from "../types";
import { t } from "../i18n";
import { addSlider, addToggle, addSelect } from "./panel-widgets";
import type { PanelState, PanelCallbacks } from "./PanelBuilder";
import { ensureRT } from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Style controls — opacity, fade, density, hover falloff
// ---------------------------------------------------------------------------
export function buildEdgeStyleControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addToggle(
		parent,
		t("display.arrows"),
		panel.showArrows,
		(v) => {
			panel.showArrows = v;
			cb.markDirty();
		},
		t("desc.arrows"),
	);
	addToggle(
		parent,
		t("display.fadeEdges"),
		panel.fadeEdgesByDegree,
		(v) => {
			panel.fadeEdgesByDegree = v;
			cb.markDirty();
		},
		t("desc.fadeEdges"),
	);
	const rtEdge = mergeRenderThresholds(panel.renderThresholds);
	addSlider(
		parent,
		t("display.edgeOpacity") ?? "Edge Opacity",
		0.05,
		1.0,
		0.05,
		rtEdge.globalEdgeAlpha,
		(v) => {
			ensureRT(panel).globalEdgeAlpha = v;
			cb.markDirty();
		},
	);
	addSlider(
		parent,
		t("display.edgeMinZoom") ?? "Edge Min Zoom",
		0,
		0.1,
		0.005,
		rtEdge.edgeMinZoom,
		(v) => {
			ensureRT(panel).edgeMinZoom = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeMinZoom") ?? "Edge Min Zoom"}: ${v.toFixed(3)}`);
		},
		t("desc.edgeMinZoom"),
	);
	addSlider(
		parent,
		t("display.edgeZoomFadeThreshold") ?? "Edge Zoom Fade",
		0.1,
		1.0,
		0.05,
		rtEdge.edgeZoomFadeThreshold,
		(v) => {
			ensureRT(panel).edgeZoomFadeThreshold = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeZoomFadeThreshold") ?? "Edge Zoom Fade"}: ${v.toFixed(2)}`);
		},
		t("desc.edgeZoomFadeThreshold"),
	);
	addSlider(
		parent,
		t("display.edgeFadeMinAlpha") ?? "Edge Fade Floor",
		0.01,
		0.5,
		0.01,
		rtEdge.edgeFadeMinAlpha,
		(v) => {
			ensureRT(panel).edgeFadeMinAlpha = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeFadeMinAlpha") ?? "Edge Fade Floor"}: ${v.toFixed(2)}`);
		},
		t("desc.edgeFadeMinAlpha"),
	);
	addSlider(
		parent,
		t("display.edgeDensityFloor") ?? "Edge Density Floor",
		0.02,
		0.5,
		0.02,
		rtEdge.edgeDensityFloor,
		(v) => {
			ensureRT(panel).edgeDensityFloor = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeDensityFloor") ?? "Edge Density Floor"}: ${v.toFixed(2)}`);
		},
	);
	addSlider(
		parent,
		t("display.hoverEdgeFalloff") ?? "Hover Edge Fade",
		0.3,
		0.95,
		0.05,
		rtEdge.hoverEdgeFalloff,
		(v) => {
			ensureRT(panel).hoverEdgeFalloff = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.hoverEdgeFalloff") ?? "Hover Edge Fade"}: ${v.toFixed(2)}`);
		},
	);
}

// ---------------------------------------------------------------------------
// Label controls — label zoom thresholds and font size
// ---------------------------------------------------------------------------
export function buildEdgeLabelControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const rtEdge = mergeRenderThresholds(panel.renderThresholds);
	addSlider(
		parent,
		t("display.edgeLabelZoomHide") ?? "Label Hide Zoom",
		0,
		0.5,
		0.05,
		rtEdge.edgeLabelZoomHide,
		(v) => {
			ensureRT(panel).edgeLabelZoomHide = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeLabelZoomHide") ?? "Label Hide Zoom"}: ${v.toFixed(2)}`);
		},
		t("desc.edgeLabelZoomHide"),
	);
	addSlider(
		parent,
		t("display.edgeLabelZoomFade") ?? "Label Fade Zoom",
		0.05,
		1.0,
		0.05,
		rtEdge.edgeLabelZoomFade,
		(v) => {
			ensureRT(panel).edgeLabelZoomFade = v;
			cb.markDirty();
			cb.announceA11y?.(`${t("display.edgeLabelZoomFade") ?? "Label Fade Zoom"}: ${v.toFixed(2)}`);
		},
		t("desc.edgeLabelZoomFade"),
	);
	addSlider(
		parent,
		t("display.edgeLabelFontSize") ?? "Edge Label Size",
		6,
		18,
		1,
		rtEdge.edgeLabelFontSize,
		(v) => {
			ensureRT(panel).edgeLabelFontSize = v;
			cb.markDirty();
		},
	);
}

// ---------------------------------------------------------------------------
// Color controls — color-by-relation toggle and label-show toggle
// ---------------------------------------------------------------------------
export function buildEdgeColorControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addToggle(
		parent,
		t("display.edgeColor"),
		panel.colorEdgesByRelation,
		(v) => {
			panel.colorEdgesByRelation = v;
			cb.markDirty();
			cb.rebuildPanel();
		},
		t("desc.edgeColor"),
	);
	addToggle(
		parent,
		t("display.edgeLabelMode.relation"),
		panel.showEdgeLabels,
		(v) => {
			panel.showEdgeLabels = v;
			cb.markDirty();
			cb.announceA11y?.(`Edge labels: ${v ? "on" : "off"}`);
		},
		t("desc.edgeLabelMode"),
	);
}

// ---------------------------------------------------------------------------
// Visibility controls — layer mode, direction filter, edge type toggles, solo
// ---------------------------------------------------------------------------
const EDGE_TYPE_KEYS: (keyof PanelState)[] = [
	"showLinks",
	"showTagEdges",
	"showCategoryEdges",
	"showSemanticEdges",
	"showInheritance",
	"showAggregation",
	"showSimilar",
	"showSibling",
	"showSequence",
	"showInlineRelation",
];

export function buildEdgeVisibilityControls(
	parent: HTMLElement,
	panel: PanelState,
	cb: PanelCallbacks,
	edgeTypeCounts: Record<string, number> = {},
): void {
	addToggle(
		parent,
		t("display.edgeLayerMode"),
		panel.edgeLayerMode,
		(v) => {
			panel.edgeLayerMode = v;
			cb.markDirty();
		},
		t("desc.edgeLayerMode"),
	);
	addSelect(
		parent,
		t("display.edgeDirectionFilter"),
		[
			{ value: "all", label: t("display.edgeDirAll") },
			{ value: "bidirectional", label: t("display.edgeDirBidirectional") },
			{ value: "unidirectional", label: t("display.edgeDirUnidirectional") },
		],
		panel.edgeDirectionFilter,
		(v) => {
			panel.edgeDirectionFilter = v as "all" | "bidirectional" | "unidirectional";
			cb.markDirty();
		},
		t("desc.edgeDirectionFilter"),
	);

	const edgeToggle = (label: string, key: keyof PanelState, after: () => void) => (v: boolean) => {
		(panel as unknown as Record<string, unknown>)[key] = v;
		after();
		cb.announceA11y?.(`${label}: ${v ? "on" : "off"}`);
	};

	const edgeTypeToggles: [string, string, keyof PanelState, string, () => void][] = [
		[t("display.links"), "link", "showLinks", t("desc.links"), () => cb.markDirty()],
		[t("display.sharedTags"), "tag", "showTagEdges", t("desc.sharedTags"), () => cb.markDirty()],
		[
			t("display.sharedCategory"),
			"category",
			"showCategoryEdges",
			t("desc.sharedCategory"),
			() => cb.markDirty(),
		],
		[t("display.semantic"), "semantic", "showSemanticEdges", t("desc.semantic"), () => cb.markDirty()],
		[t("display.inheritance"), "inheritance", "showInheritance", t("desc.inheritance"), () => cb.markDirty()],
		[t("display.aggregation"), "aggregation", "showAggregation", t("desc.aggregation"), () => cb.markDirty()],
		[t("display.similar"), "similar", "showSimilar", t("desc.similar"), () => cb.invalidateDataKeepPanel()],
		[t("display.sibling"), "sibling", "showSibling", t("desc.sibling"), () => cb.markDirty()],
		[t("display.sequence"), "sequence", "showSequence", t("desc.sequence"), () => cb.markDirty()],
		[
			t("display.inlineRelation"),
			"inline-relation",
			"showInlineRelation",
			t("desc.inlineRelation"),
			() => cb.markDirty(),
		],
	];
	for (const [label, edgeType, key, desc, after] of edgeTypeToggles) {
		const count = edgeTypeCounts[edgeType] ?? 0;
		// Always show "similar" toggle (count=0 when OFF due to data filtering)
		if (count === 0 && edgeType !== "similar") continue;
		const labelWithCount = `${label} (${count})`;
		addToggle(parent, labelWithCount, panel[key] as boolean, edgeToggle(label, key, after), desc);
	}

	const soloRow = parent.createDiv({ cls: "gi-setting-row" });
	const soloBtn = soloRow.createEl("button", { cls: "gi-solo-btn", text: t("display.soloEdgeType") });
	soloBtn.title = t("desc.soloEdgeType");
	soloBtn.addEventListener("click", () => {
		const onKeys = EDGE_TYPE_KEYS.filter((k) => panel[k] as boolean);
		if (onKeys.length === 1) {
			const idx = EDGE_TYPE_KEYS.indexOf(onKeys[0]);
			const nextIdx = (idx + 1) % EDGE_TYPE_KEYS.length;
			if (nextIdx === 0) {
				for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = true;
			} else {
				for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
				(panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[nextIdx]] = true;
			}
		} else {
			for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
			(panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[0]] = true;
		}
		cb.markDirty();
		cb.rebuildPanel();
	});
}
