/**
 * panel-sections-node-display.ts
 *
 * Node-display sub-section builders extracted from
 * panel-sections-display.ts:buildNodeDisplaySection to reduce function size
 * while preserving the original UI structure (basic controls visible at the
 * top, advanced controls in a collapsed details group).
 *
 * Each helper appends UI controls to the supplied `parent` element. The
 * caller (buildNodeDisplaySection) decides whether to pass the basic body
 * or the advanced (collapsed) container.
 */
import { mergeRenderThresholds } from "../types";
import { t } from "../i18n";
import type { NodeShape } from "../utils/node-shapes";
import { ALL_SHAPES } from "../utils/node-shapes";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";
import type { PanelState, PanelCallbacks } from "./PanelBuilder";
import { ensureRT } from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Size / color controls — color-mode dropdown, field selector, custom palette,
// and the node-size slider (basic controls).
// ---------------------------------------------------------------------------
export function buildNodeSizeControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const colorModeOptions = [
		{ value: "default", label: t("display.nodeColor.default") },
		{ value: "category", label: t("display.nodeColor.category") },
		{ value: "heatmap", label: t("display.nodeColor.heatmap") },
		{ value: "community", label: t("display.nodeColor.community") },
		{ value: "field", label: t("display.nodeColor.field") ?? "By Field" },
	];
	const currentColorMode = panel.nodeColorMode ?? "category";
	addSelect(
		parent,
		t("display.nodeColorMode"),
		colorModeOptions,
		currentColorMode,
		(v) => {
			panel.nodeColorMode = v as PanelState["nodeColorMode"];
			cb.recolorNodes();
			cb.rebuildPanel();
		},
		t("desc.nodeColorMode"),
	);
	// EO+EQ: Field selector when mode is "field" (with autocomplete from frontmatter)
	if (currentColorMode === "field") {
		const fields = cb.collectFieldSuggestions();
		const options = [{ value: "", label: "-- select --" }, ...fields.map((f) => ({ value: f, label: f }))];
		addSelect(
			parent,
			t("display.nodeColorField") ?? "Color Field",
			options,
			panel.nodeColorField ?? "",
			(v) => {
				panel.nodeColorField = v;
				cb.recolorNodes();
			},
		);
		// ET: Custom color palette input
		addTextInput(
			parent,
			t("display.customPalette") ?? "Custom Palette",
			panel.customColorPalette ?? "",
			"#ff0000, #00ff00, #0000ff",
			(v) => {
				panel.customColorPalette = v;
				cb.doRenderKeepPanel();
			},
		);
	}
	addSlider(
		parent,
		t("display.nodeSize"),
		5,
		300,
		1,
		panel.nodeSize,
		(v) => {
			panel.nodeSize = v;
			cb.resetZoomBaseNodeSize();
			cb.recalcNodeRadii();
			cb.markDirty();
		},
		t("desc.nodeSize"),
	);
}

// ---------------------------------------------------------------------------
// Label controls — text fade, label density, label-mode override, and the
// maximum-label-chars slider (basic controls).
// ---------------------------------------------------------------------------
export function buildNodeLabelControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addSlider(
		parent,
		t("display.textFade"),
		0,
		1,
		0.05,
		panel.textFadeThreshold,
		(v) => {
			panel.textFadeThreshold = v;
			cb.applyTextFade();
		},
		t("desc.textFade"),
	);
	const rtDens = mergeRenderThresholds(panel.renderThresholds);
	addSlider(
		parent,
		t("display.labelDensity") ?? "Label Density",
		0.2,
		3.0,
		0.1,
		rtDens.labelDensity,
		(v) => {
			ensureRT(panel).labelDensity = v;
			cb.applyTextFade();
			cb.announceA11y?.(`${t("display.labelDensity") ?? "Label Density"}: ${v.toFixed(1)}`);
		},
		t("desc.labelDensity") ?? "Controls how many labels are shown when zoomed out",
	);
	const rtMode = mergeRenderThresholds(panel.renderThresholds);
	addSelect(
		parent,
		t("display.labelMode") ?? "Label Mode",
		[
			{ value: "auto", label: "Auto (zoom)" },
			{ value: "initials", label: "Initials (2 chars)" },
			{ value: "truncated", label: "Truncated (5-12)" },
			{ value: "full", label: "Full name" },
		],
		rtMode.labelModeOverride,
		(v) => {
			ensureRT(panel).labelModeOverride = v as "auto" | "initials" | "truncated" | "full";
			cb.applyTextFade();
			cb.announceA11y?.(`${t("display.labelMode") ?? "Label Mode"}: ${v}`);
		},
	);
	// GD: Label max characters
	const rtLabel = mergeRenderThresholds(panel.renderThresholds);
	addSlider(parent, t("display.labelMaxChars") ?? "Label Max Chars", 0, 60, 1, rtLabel.labelMaxChars, (v) => {
		ensureRT(panel).labelMaxChars = v;
		cb.rebuildNodesInPlace();
	});
}

// ---------------------------------------------------------------------------
// Shape controls — tag-node shape (when showTagNodes is true) and default
// node shape (advanced controls).
// ---------------------------------------------------------------------------
export function buildNodeShapeControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	// GH: Shape preview swatches
	const shapeIcons: Record<string, string> = {
		circle: "O",
		triangle: "^",
		square: "#",
		diamond: "<>",
		pentagon: "5",
		hexagon: "6",
		star: "*",
		cross: "+",
	};
	const shapeOptions = ALL_SHAPES.map((s) => ({
		value: s,
		label: `${shapeIcons[s] ?? ""} ${t(`shape.${s}`)}`,
	}));
	const defaultRule = panel.nodeShapeRules.find((r) => r.match === "default");
	if (panel.showTagNodes) {
		const tagRule = panel.nodeShapeRules.find((r) => r.match === "isTag");
		addSelect(
			parent,
			t("display.tagNodeShape"),
			shapeOptions,
			tagRule?.shape ?? "triangle",
			(v) => {
				const rule = panel.nodeShapeRules.find((r) => r.match === "isTag");
				if (rule) rule.shape = v as NodeShape;
				else panel.nodeShapeRules.unshift({ match: "isTag", shape: v as NodeShape });
				cb.rebuildNodesInPlace();
			},
			t("desc.tagNodeShape"),
		);
	}
	addSelect(
		parent,
		t("display.defaultNodeShape"),
		shapeOptions,
		defaultRule?.shape ?? "circle",
		(v) => {
			const rule = panel.nodeShapeRules.find((r) => r.match === "default");
			if (rule) rule.shape = v as NodeShape;
			else panel.nodeShapeRules.push({ match: "default", shape: v as NodeShape });
			cb.rebuildNodesInPlace();
		},
		t("desc.defaultNodeShape"),
	);
}

// ---------------------------------------------------------------------------
// Thumbnail / hover-preview / icon controls — hover card contents, node
// icons, hover-hops, per-edge-type filtering, focus mode etc. (advanced).
// Despite the name, this bundles every advanced control that shapes how a
// node's preview/thumbnail is rendered on hover or focus.
// ---------------------------------------------------------------------------
export function buildNodeThumbnailControls(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const rtNode = mergeRenderThresholds(panel.renderThresholds);
	addToggle(
		parent,
		t("display.nodeSizeByDegree"),
		rtNode.nodeSizeByDegree,
		(v) => {
			ensureRT(panel).nodeSizeByDegree = v;
			cb.recalcNodeRadii();
			cb.markDirty();
		},
		t("desc.nodeSizeByDegree"),
	);
	addTextInput(
		parent,
		t("display.nodeSubLabelFields"),
		panel.nodeSubLabelFields ?? "",
		"e.g. category, date, degree",
		(v) => {
			panel.nodeSubLabelFields = v;
			cb.rebuildNodesInPlace();
		},
	);
	addTextInput(
		parent,
		t("display.hoverTooltipFields"),
		panel.hoverTooltipFields ?? "",
		"e.g. date, story_order",
		(v) => {
			panel.hoverTooltipFields = v;
			cb.clearHoverTooltips();
			cb.applyHover();
			cb.markDirty();
		},
	);
	// IE: Hover/card content checklist
	addToggle(parent, t("display.hoverShowTitle") ?? "Hover: Title", panel.hoverShowTitle, (v) => {
		panel.hoverShowTitle = v;
		cb.clearHoverTooltips();
		cb.applyHover();
		cb.markDirty();
	});
	addToggle(parent, t("display.hoverShowMeta") ?? "Hover: Metadata", panel.hoverShowMeta, (v) => {
		panel.hoverShowMeta = v;
		cb.clearHoverTooltips();
		cb.applyHover();
		cb.markDirty();
	});
	addToggle(parent, t("display.hoverShowBody") ?? "Hover: Body", panel.hoverShowBody, (v) => {
		panel.hoverShowBody = v;
		cb.clearHoverTooltips();
		cb.applyHover();
		cb.markDirty();
	});
	// A3: Node icon prefix
	addTextInput(parent, t("display.nodeIconField"), panel.nodeIconField ?? "", "e.g. node_type", (v) => {
		panel.nodeIconField = v;
		cb.rebuildNodesInPlace();
	});
	addTextInput(
		parent,
		t("display.nodeIconMap"),
		JSON.stringify(panel.nodeIconMap ?? {}),
		'{"character":"👤","episode":"📖"}',
		(v) => {
			try {
				panel.nodeIconMap = JSON.parse(v);
			} catch (_e) {
				/* ignore invalid JSON */
			}
			cb.rebuildNodesInPlace();
		},
	);
	addSlider(
		parent,
		t("display.hoverHops"),
		1,
		5,
		1,
		panel.hoverHops,
		(v) => {
			panel.hoverHops = v;
			cb.rebuildHoverAdj();
			cb.applyHover();
			cb.markDirty();
		},
		t("desc.hoverHops"),
	);
	_addHoverEdgeTypeToggles(parent, panel, cb);
	// HR: Max hover neighbor labels
	const rtHover = mergeRenderThresholds(panel.renderThresholds);
	addSlider(
		parent,
		t("display.maxHoverLabels") ?? "Max Hover Labels",
		5,
		100,
		5,
		rtHover.maxHoverNeighborLabels,
		(v) => {
			ensureRT(panel).maxHoverNeighborLabels = v;
			cb.applyHover();
			cb.announceA11y?.(`${t("display.maxHoverLabels") ?? "Max Hover Labels"}: ${v}`);
		},
	);
	// フォーカスモード: クリックでハイライトを固定
	addToggle(
		parent,
		t("display.focusMode"),
		panel.focusMode,
		(v) => {
			panel.focusMode = v;
			if (!v) {
				panel.focusNodeId = null;
				cb.applyHover();
			}
			cb.markDirty();
			cb.rebuildPanel();
		},
		t("desc.focusMode"),
	);
	// R2: フォーカスコーン — only shown when focusMode is enabled (progressive disclosure)
	if (panel.focusMode) {
		addToggle(
			parent,
			t("display.focusCone"),
			panel.focusConeEnabled ?? true,
			(v) => {
				panel.focusConeEnabled = v;
				cb.applyHover();
			},
			t("desc.focusCone"),
		);
	}
}

/** Hover edge type filter toggles — shared helper. */
function _addHoverEdgeTypeToggles(parent: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const het = panel.hoverEdgeTypes ?? {
		link: true,
		semantic: false,
		tag: false,
		hasTag: false,
		similar: false,
		sibling: false,
		sequence: false,
		inheritance: true,
		aggregation: true,
	};
	type HetKey = keyof typeof het;
	const hoverTypeEntries: [HetKey, string][] = [
		["link", t("hover.link") ?? "Link"],
		["semantic", t("hover.semantic") ?? "Semantic"],
		["tag", t("hover.tag") ?? "Tag"],
		["hasTag", t("hover.hasTag") ?? "Has-Tag"],
		["similar", t("hover.similar") ?? "Similar"],
		["inheritance", t("hover.inheritance") ?? "Inheritance"],
		["aggregation", t("hover.aggregation") ?? "Aggregation"],
		["sibling", t("hover.sibling") ?? "Sibling"],
		["sequence", t("hover.sequence") ?? "Sequence"],
	];
	for (const [key, label] of hoverTypeEntries) {
		addToggle(parent, label, het[key] ?? false, (v) => {
			if (!panel.hoverEdgeTypes) panel.hoverEdgeTypes = { ...het };
			panel.hoverEdgeTypes[key] = v;
			cb.rebuildHoverAdj();
			cb.applyHover();
			cb.markDirty();
		});
	}
}
