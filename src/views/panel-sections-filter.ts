/**
 * panel-sections-filter.ts
 *
 * Extracted display-tab section builders from PanelBuilder.ts to reduce
 * god-object size.  Each function builds one collapsible section inside
 * the Display (or related) panel tab.
 */
import type { NodeDisplayMode } from "../types";
import { mergeRenderThresholds } from "../types";
import { t, tHelp } from "../i18n";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection } from "./PanelBuilder";
import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "./panel-sections-filter-card-helpers";
import {
	ensureHoverHighlightTypes,
	shouldShowCardSubSettings,
	shouldShowDonutSubSettings,
} from "./panel-sections-filter-logic";

// ---------------------------------------------------------------------------
// Hover behavior section
// ---------------------------------------------------------------------------
export function buildHoverBehaviorSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.hoverBehavior") ?? "ホバー時の動作",
		(body) => {
			// Hover highlight type toggles
			const hht = ensureHoverHighlightTypes(panel.hoverHighlightTypes);
			addToggle(body, t("hover.forwardLinks") ?? "リンク先", hht.forwardLinks, (v) => {
				if (!panel.hoverHighlightTypes) panel.hoverHighlightTypes = { ...hht };
				panel.hoverHighlightTypes.forwardLinks = v;
				cb.rebuildHoverAdj();
				cb.applyHover();
				cb.markDirty();
			});
			addToggle(body, t("hover.backlinks") ?? "バックリンク先", hht.backlinks, (v) => {
				if (!panel.hoverHighlightTypes) panel.hoverHighlightTypes = { ...hht };
				panel.hoverHighlightTypes.backlinks = v;
				cb.rebuildHoverAdj();
				cb.applyHover();
				cb.markDirty();
			});
			addToggle(body, t("hover.sharedTags") ?? "同じタグのノード", hht.sharedTags, (v) => {
				if (!panel.hoverHighlightTypes) panel.hoverHighlightTypes = { ...hht };
				panel.hoverHighlightTypes.sharedTags = v;
				cb.rebuildHoverAdj();
				cb.applyHover();
				cb.markDirty();
			});
			addToggle(body, t("hover.sameFolder") ?? "同じフォルダのノード", hht.sameFolder, (v) => {
				if (!panel.hoverHighlightTypes) panel.hoverHighlightTypes = { ...hht };
				panel.hoverHighlightTypes.sameFolder = v;
				cb.rebuildHoverAdj();
				cb.applyHover();
				cb.markDirty();
			});
			// Hover depth
			addSlider(
				body,
				t("display.hoverHops") ?? "ホバー深度",
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
		},
		undefined,
		false,
		"mouse-pointer-2",
	);
}

// ---------------------------------------------------------------------------
// Node display mode section (card / donut / sunburst)
// ---------------------------------------------------------------------------
export function buildNodeDisplayModeSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("display.nodeDisplayMode"),
		(body) => {
			const modeOptions = [
				{ value: "node", label: t("display.modeNode") },
				{ value: "card", label: t("display.modeCard") },
				{ value: "donut", label: t("display.modeDonut") },
				{ value: "sunburst-segment", label: t("display.modeSunburst") },
			];
			addSelect(
				body,
				t("display.nodeDisplayMode"),
				modeOptions,
				panel.nodeDisplayMode,
				(v) => {
					panel.nodeDisplayMode = v as NodeDisplayMode;
					cb.doRenderKeepPanel();
					cb.rebuildPanel(); // Progressive disclosure: card/donut sub-settings
					// HF: Announce display mode change for screen readers
					const modeLabel = modeOptions.find((o) => o.value === v)?.label ?? v;
					cb.announceA11y?.(`${t("display.nodeDisplayMode")}: ${modeLabel}`);
				},
				t("desc.nodeDisplayMode"),
			);

			// Progressive disclosure: show sub-settings based on mode
			if (shouldShowCardSubSettings(panel.nodeDisplayMode)) {
				_buildCardSubSettings(body, panel, cb);
			} else if (shouldShowDonutSubSettings(panel.nodeDisplayMode)) {
				_buildDonutSubSettings(body, panel, cb);
			}
			// sunburst-segment mode: uses default arcAngle (30 degrees)
		},
		t("desc.nodeDisplayMode"),
		false,
		"layout-grid",
	);
}

// ---------------------------------------------------------------------------
// Cable display section (bundle mode, trunk/fan settings)
// ---------------------------------------------------------------------------
export function buildCableDisplaySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("display.cableBundleMode"),
		(body) => {
			addSelect(
				body,
				t("display.cableBundleMode"),
				[
					{ value: "auto", label: t("display.cableModeAuto") },
					{ value: "always", label: t("display.cableModeAlways") },
					{ value: "never", label: t("display.cableModeNever") },
				],
				panel.cableBundleMode,
				(v) => {
					panel.cableBundleMode = v as "auto" | "always" | "never";
					cb.markDirty();
					cb.rebuildPanel(); // Progressive disclosure: show/hide cable sub-sliders
				},
				t("desc.cableBundleMode"),
			);

			// Progressive disclosure: show sub-settings only when cables can be active
			if (panel.cableBundleMode !== "never") {
				addSlider(
					body,
					t("display.cableTrunkWidth"),
					2,
					24,
					1,
					panel.cableTrunkWidth,
					(v) => {
						panel.cableTrunkWidth = v;
						cb.markDirty();
					},
					t("desc.cableTrunkWidth"),
				);
				addSlider(
					body,
					t("display.cableTrunkAlpha"),
					0,
					1,
					0.05,
					panel.cableTrunkAlpha,
					(v) => {
						panel.cableTrunkAlpha = v;
						cb.markDirty();
					},
					t("desc.cableTrunkAlpha"),
				);
				addSlider(
					body,
					t("display.cableSpacing"),
					2,
					30,
					1,
					panel.cableSpacing,
					(v) => {
						panel.cableSpacing = v;
						cb.markDirty();
					},
					t("desc.cableSpacing"),
				);
				addSlider(
					body,
					t("display.cableFanWidth"),
					0.5,
					6,
					0.5,
					panel.cableFanWidth,
					(v) => {
						panel.cableFanWidth = v;
						cb.markDirty();
					},
					t("desc.cableFanWidth"),
				);
				addSlider(
					body,
					t("display.cableFanAlpha"),
					0.05,
					1,
					0.05,
					panel.cableFanAlpha,
					(v) => {
						panel.cableFanAlpha = v;
						cb.markDirty();
					},
					t("desc.cableFanAlpha"),
				);
			}
		},
		tHelp("help.cableBundle"),
		true,
		"git-merge",
	);
}

// ---------------------------------------------------------------------------
// Road network section
// ---------------------------------------------------------------------------
export function buildRoadNetworkSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.roadNetwork"),
		(body) => {
			const rt = mergeRenderThresholds(panel.renderThresholds);
			addToggle(
				body,
				t("display.showRoadNetwork"),
				rt.showRoadNetwork,
				(v) => {
					ensureRT(panel).showRoadNetwork = v;
					cb.markDirty();
					cb.rebuildPanel(); // Progressive disclosure: show/hide road sub-settings
				},
				t("desc.showRoadNetwork"),
			);
			// Progressive disclosure: show sub-settings only when road network is active
			if (rt.showRoadNetwork) {
				addToggle(
					body,
					t("display.roadRouteEdges"),
					rt.roadRouteEdges,
					(v) => {
						ensureRT(panel).roadRouteEdges = v;
						cb.markDirty();
					},
					t("desc.roadRouteEdges"),
				);
				addSlider(
					body,
					t("display.roadAlpha"),
					0.05,
					0.8,
					0.05,
					rt.roadAlpha,
					(v) => {
						ensureRT(panel).roadAlpha = v;
						cb.markDirty();
					},
					t("desc.roadAlpha"),
				);
				addSlider(
					body,
					t("display.roadWidth"),
					2,
					20,
					1,
					rt.roadWidth,
					(v) => {
						ensureRT(panel).roadWidth = v;
						cb.markDirty();
					},
					t("desc.roadWidth"),
				);
			}
		},
		tHelp("help.roadNetwork"),
		true,
		"map",
	);
}

// ---------------------------------------------------------------------------
// Minimap / display-other section
// ---------------------------------------------------------------------------
export function buildMinimapSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.displayOther"),
		(body) => {
			addToggle(
				body,
				t("display.minimap"),
				panel.showMinimap,
				(v) => {
					panel.showMinimap = v;
					cb.refreshOverlays();
				},
				t("desc.minimap"),
			);
			addToggle(
				body,
				t("display.showLegend"),
				panel.showLegend,
				(v) => {
					panel.showLegend = v;
					cb.refreshOverlays();
				},
				t("desc.showLegend"),
			);
			addToggle(
				body,
				t("display.oobIndicator"),
				panel.showOutOfBoundsIndicator ?? false,
				(v) => {
					panel.showOutOfBoundsIndicator = v;
					cb.markDirty();
				},
				t("desc.oobIndicator"),
			);
			addToggle(
				body,
				t("display.graphStats"),
				panel.showGraphStats ?? false,
				(v) => {
					panel.showGraphStats = v;
					cb.refreshOverlays();
					cb.rebuildPanel();
				},
				t("desc.graphStats"),
			);
			addToggle(
				body,
				t("display.highContrast") ?? "High Contrast",
				panel.highContrastMode,
				(v) => {
					panel.highContrastMode = v;
					cb.markDirty();
				},
				t("desc.highContrast") ?? "Thicker edges and stronger outlines for better visibility",
			);
			// IL: Zoom wheel sensitivity slider (a11y: low-dexterity users)
			addSlider(
				body,
				t("display.zoomSensitivity") ?? "Zoom Sensitivity",
				0.3,
				2.0,
				0.1,
				panel.zoomSensitivity,
				(v) => {
					panel.zoomSensitivity = v;
				},
				t("desc.zoomSensitivity") ?? "Scroll wheel zoom speed (0.3=gentle, 1.0=normal, 2.0=fast)",
			);
			// EE: Saved viewport list
			if (panel.savedViewports && panel.savedViewports.length > 0) {
				const vpList = body.createDiv({ cls: "gi-viewport-list" });
				vpList.style.cssText = "margin-top:6px;font-size:11px;";
				for (const vp of panel.savedViewports) {
					const row = vpList.createDiv({ cls: "gi-viewport-item" });
					row.style.cssText =
						"display:flex;justify-content:space-between;align-items:center;padding:2px 0;cursor:pointer;";
					row.createEl("span", { text: vp.name });
					row.addEventListener("click", () => {
						cb.restoreViewport?.(vp.name);
					});
					const del = row.createEl("span", { text: "x", cls: "gi-viewport-del" });
					del.style.cssText = "cursor:pointer;color:var(--text-muted);margin-left:4px;font-size:10px;";
					del.addEventListener("click", (e) => {
						e.stopPropagation();
						panel.savedViewports = panel.savedViewports.filter((v) => v !== vp);
						cb.rebuildPanel();
					});
				}
			}
		},
		tHelp("help.displayOther"),
		false,
		"eye",
	);
}

// ---------------------------------------------------------------------------
// Relation color section (edge color pickers)
// ---------------------------------------------------------------------------
export function buildRelationColorSection(
	tabEl: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	if (panel.colorEdgesByRelation && ctx.relationColors.size > 0) {
		buildSection(
			tabEl,
			t("section.relationColors"),
			(body) => {
				const container = body.createDiv({ cls: "graph-color-groups-container" });
				for (const [rel, color] of ctx.relationColors) {
					const group = container.createDiv({ cls: "graph-color-group" });
					/* label element */ group.createEl("span", {
						text: rel,
						cls: "graph-color-group-label gi-color-group-label",
					});
					const picker = group.createEl("input", { type: "color" });
					picker.setAttribute("aria-label", t("relationColors.changeColor"));
					picker.value = color;
					picker.addEventListener("input", () => {
						ctx.relationColors.set(rel, picker.value);
						cb.markDirty();
					});
				}
			},
			tHelp("help.relationColors"),
			false,
			"palette",
		);
	}
}

// ---------------------------------------------------------------------------
// Card display sub-settings (extracted from buildNodeDisplayModeSection)
// ---------------------------------------------------------------------------
function _buildCardSubSettings(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addCardPresetSelector(body, panel, cb);
	addCardDisplayOptions(body, panel, cb);
	addCardBodyControls(body, panel, cb);
}

// ---------------------------------------------------------------------------
// Donut display sub-settings (extracted from buildNodeDisplayModeSection)
// ---------------------------------------------------------------------------
function _buildDonutSubSettings(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addTextInput(
		body,
		t("display.donutBreakdown"),
		panel.donutDisplayConfig.breakdownField ?? "",
		"e.g. category, node_type",
		(v) => {
			panel.donutDisplayConfig.breakdownField = v.trim() || undefined;
			cb.doRenderKeepPanel();
		},
	);
	addSlider(body, t("display.donutInnerRadius"), 0, 0.9, 0.05, panel.donutDisplayConfig.innerRadius ?? 0.6, (v) => {
		panel.donutDisplayConfig.innerRadius = v;
		cb.doRenderKeepPanel();
	});
}
