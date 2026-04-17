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

// ---------------------------------------------------------------------------
// Edge Display section builder
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
			// --- Basic (always visible) ---
			addToggle(
				body,
				t("display.arrows"),
				panel.showArrows,
				(v) => {
					panel.showArrows = v;
					cb.markDirty();
				},
				t("desc.arrows"),
			);
			addToggle(
				body,
				t("display.fadeEdges"),
				panel.fadeEdgesByDegree,
				(v) => {
					panel.fadeEdgesByDegree = v;
					cb.markDirty();
				},
				t("desc.fadeEdges"),
			);
			// GG: Global edge opacity
			const rtEdge = mergeRenderThresholds(panel.renderThresholds);
			addSlider(
				body,
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
				body,
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
			// Edge zoom fade threshold — controls gradual thinning/fading
			addSlider(
				body,
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
			// Edge label zoom thresholds
			addSlider(
				body,
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
				body,
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
			// Edge fade minimum alpha
			addSlider(
				body,
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
			// GW: Edge label font size
			addSlider(
				body,
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
			// HV: Hover edge alpha falloff
			// IQ: Edge density floor — minimum alpha when many edges overlap
			addSlider(
				body,
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
				body,
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
			// --- Advanced (hidden by default) ---
			addAdvancedGroup(body, (adv) => {
				addToggle(
					adv,
					t("display.edgeColor"),
					panel.colorEdgesByRelation,
					(v) => {
						panel.colorEdgesByRelation = v;
						cb.markDirty();
						cb.rebuildPanel();
					},
					t("desc.edgeColor"),
				);
				// Edge labels: simplified to on/off toggle
				addToggle(
					adv,
					t("display.edgeLabelMode.relation"),
					panel.showEdgeLabels,
					(v) => {
						panel.showEdgeLabels = v;
						cb.markDirty();
						cb.announceA11y?.(`Edge labels: ${v ? "on" : "off"}`);
					},
					t("desc.edgeLabelMode"),
				);
				addToggle(
					adv,
					t("display.edgeLayerMode"),
					panel.edgeLayerMode,
					(v) => {
						panel.edgeLayerMode = v;
						cb.markDirty();
					},
					t("desc.edgeLayerMode"),
				);
				addSelect(
					adv,
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
				// GN: Edge toggle with a11y announcements
				const _edgeToggle = (label: string, key: keyof PanelState, cb2: () => void) => (v: boolean) => {
					(panel as unknown as Record<string, unknown>)[key] = v;
					cb2();
					cb.announceA11y?.(`${label}: ${v ? "on" : "off"}`);
				};
				// Edge type toggles — hide types with 0 edges, show count for others
				const etc = _ctx.edgeTypeCounts ?? {};
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
					[
						t("display.inheritance"),
						"inheritance",
						"showInheritance",
						t("desc.inheritance"),
						() => cb.markDirty(),
					],
					[
						t("display.aggregation"),
						"aggregation",
						"showAggregation",
						t("desc.aggregation"),
						() => cb.markDirty(),
					],
					[
						t("display.similar"),
						"similar",
						"showSimilar",
						t("desc.similar"),
						() => cb.invalidateDataKeepPanel(),
					],
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
				for (const [label, edgeType, key, desc, cb2] of edgeTypeToggles) {
					const count = etc[edgeType] ?? 0;
					// Always show "similar" toggle (count=0 when OFF due to data filtering)
					if (count === 0 && edgeType !== "similar") continue;
					const labelWithCount = `${label} (${count})`;
					addToggle(adv, labelWithCount, panel[key] as boolean, _edgeToggle(label, key, cb2), desc);
				}

				// Solo button: cycle through edge types one at a time
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
				const soloRow = adv.createDiv({ cls: "gi-setting-row" });
				const soloBtn = soloRow.createEl("button", { cls: "gi-solo-btn", text: t("display.soloEdgeType") });
				soloBtn.title = t("desc.soloEdgeType");
				soloBtn.addEventListener("click", () => {
					// Find currently soloed type (exactly one ON, rest OFF)
					const onKeys = EDGE_TYPE_KEYS.filter((k) => panel[k] as boolean);
					if (onKeys.length === 1) {
						// Advance to next type
						const idx = EDGE_TYPE_KEYS.indexOf(onKeys[0]);
						const nextIdx = (idx + 1) % EDGE_TYPE_KEYS.length;
						if (nextIdx === 0) {
							// Wrapped around: restore all ON
							for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = true;
						} else {
							for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
							(panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[nextIdx]] = true;
						}
					} else {
						// Start solo: turn on only the first type
						for (const k of EDGE_TYPE_KEYS) (panel as unknown as Record<string, unknown>)[k] = false;
						(panel as unknown as Record<string, unknown>)[EDGE_TYPE_KEYS[0]] = true;
					}
					cb.markDirty();
					cb.rebuildPanel();
				});
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
