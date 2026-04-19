/**
 * panel-sections-display.ts
 *
 * Extracted display-tab section builders from PanelBuilder.ts to reduce
 * god-object size.  Each function builds one collapsible section inside
 * the Display panel tab.
 */
import { mergeRenderThresholds } from "../types";
import { t, tHelp } from "../i18n";
import type { NodeShape } from "../utils/node-shapes";
import { ALL_SHAPES } from "../utils/node-shapes";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection, addAdvancedGroup } from "./PanelBuilder";
import {
	buildEdgeStyleControls,
	buildEdgeLabelControls,
	buildEdgeColorControls,
	buildEdgeVisibilityControls,
} from "./panel-sections-edge-display";

// ---------------------------------------------------------------------------
// Edge Display section builder — orchestrates extracted helpers
// ---------------------------------------------------------------------------
export function buildEdgeDisplaySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.displayEdges"),
		(body) => {
			buildEdgeStyleControls(body, panel, cb);
			buildEdgeLabelControls(body, panel, cb);
			addAdvancedGroup(body, (adv) => {
				buildEdgeColorControls(adv, panel, cb);
				buildEdgeVisibilityControls(adv, panel, cb, _ctx.edgeTypeCounts ?? {});
			});
		},
		tHelp("help.displayEdges"),
		false,
		"git-branch",
	);
}

// ---------------------------------------------------------------------------
// Node Display section builder
// ---------------------------------------------------------------------------
export function buildNodeDisplaySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.displayNodes"),
		(body) => {
			// --- Basic (always visible) ---
			// Node color mode dropdown
			const colorModeOptions = [
				{ value: "default", label: t("display.nodeColor.default") },
				{ value: "category", label: t("display.nodeColor.category") },
				{ value: "heatmap", label: t("display.nodeColor.heatmap") },
				{ value: "community", label: t("display.nodeColor.community") },
				{ value: "field", label: t("display.nodeColor.field") ?? "By Field" },
			];
			const currentColorMode = panel.nodeColorMode ?? "category";
			addSelect(
				body,
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
					body,
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
					body,
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
				body,
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
			addSlider(
				body,
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
			// Label density at zoom-out
			const rtDens = mergeRenderThresholds(panel.renderThresholds);
			addSlider(
				body,
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
			// Label mode override (auto / initials / truncated / full)
			const rtMode = mergeRenderThresholds(panel.renderThresholds);
			addSelect(
				body,
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
			addSlider(body, t("display.labelMaxChars") ?? "Label Max Chars", 0, 60, 1, rtLabel.labelMaxChars, (v) => {
				ensureRT(panel).labelMaxChars = v;
				cb.rebuildNodesInPlace();
			});
			// --- Advanced (hidden by default) ---
			addAdvancedGroup(body, (adv) => {
				const rtNode = mergeRenderThresholds(panel.renderThresholds);
				addToggle(
					adv,
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
					adv,
					t("display.nodeSubLabelFields"),
					panel.nodeSubLabelFields ?? "",
					"e.g. category, date, degree",
					(v) => {
						panel.nodeSubLabelFields = v;
						cb.rebuildNodesInPlace();
					},
				);
				addTextInput(
					adv,
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
				addToggle(adv, t("display.hoverShowTitle") ?? "Hover: Title", panel.hoverShowTitle, (v) => {
					panel.hoverShowTitle = v;
					cb.clearHoverTooltips();
					cb.applyHover();
					cb.markDirty();
				});
				addToggle(adv, t("display.hoverShowMeta") ?? "Hover: Metadata", panel.hoverShowMeta, (v) => {
					panel.hoverShowMeta = v;
					cb.clearHoverTooltips();
					cb.applyHover();
					cb.markDirty();
				});
				addToggle(adv, t("display.hoverShowBody") ?? "Hover: Body", panel.hoverShowBody, (v) => {
					panel.hoverShowBody = v;
					cb.clearHoverTooltips();
					cb.applyHover();
					cb.markDirty();
				});
				// A3: Node icon prefix
				addTextInput(adv, t("display.nodeIconField"), panel.nodeIconField ?? "", "e.g. node_type", (v) => {
					panel.nodeIconField = v;
					cb.rebuildNodesInPlace();
				});
				addTextInput(
					adv,
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
					adv,
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
				_addHoverEdgeTypeToggles(adv, panel, cb);
				// HR: Max hover neighbor labels
				const rtHover = mergeRenderThresholds(panel.renderThresholds);
				addSlider(
					adv,
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
					adv,
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
						adv,
						t("display.focusCone"),
						panel.focusConeEnabled ?? true,
						(v) => {
							panel.focusConeEnabled = v;
							cb.applyHover();
						},
						t("desc.focusCone"),
					);
				}
				// R2: highlightMissingNeighbors toggle removed — now controlled via analysisOverlay dropdown
				// --- ノード形状 ---
				_addNodeShapeSelects(adv, panel, cb);
			});
		},
		tHelp("help.displayNodes"),
		false,
		"circle-dot",
	);
}

/** Hover edge type filter toggles — extracted to reduce arrow function complexity. */
function _addHoverEdgeTypeToggles(adv: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
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
		addToggle(adv, label, het[key] ?? false, (v) => {
			if (!panel.hoverEdgeTypes) panel.hoverEdgeTypes = { ...het };
			panel.hoverEdgeTypes[key] = v;
			cb.rebuildHoverAdj();
			cb.applyHover();
			cb.markDirty();
		});
	}
}

/** Node shape select controls — extracted to reduce arrow function complexity. */
function _addNodeShapeSelects(adv: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
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
			adv,
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
		adv,
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
