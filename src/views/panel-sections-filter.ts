/**
 * panel-sections-filter.ts
 *
 * Extracted display-tab section builders from PanelBuilder.ts to reduce
 * god-object size.  Each function builds one collapsible section inside
 * the Display (or related) panel tab.
 */
import type { NodeDisplayMode } from "../types";
import { mergeRenderThresholds } from "../types";
import { setIcon } from "obsidian";
import { t, tHelp } from "../i18n";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection } from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Bookmark section builder (Feature L)
// ---------------------------------------------------------------------------
export function buildBookmarkSection(
	tabEl: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.bookmarks"),
		(body) => {
			if (panel.bookmarkedNodes.length === 0) {
				body.createEl("p", { cls: "gi-hint", text: t("bookmark.empty") });
				return;
			}
			const list = body.createDiv({ cls: "gi-bookmark-list" });
			for (const nodeId of panel.bookmarkedNodes) {
				const row = list.createDiv({ cls: "gi-bookmark-item" });
				// ノード名ラベル — クリックでジャンプ
				const label = row.createEl("span", { cls: "gi-bookmark-label", text: nodeId });
				label.addEventListener("click", () => {
					cb.jumpToNode(nodeId);
				});
				// 削除ボタン
				const removeBtn = row.createEl("span", { cls: "gi-bookmark-remove" });
				setIcon(removeBtn, "x");
				removeBtn.setAttribute("aria-label", t("bookmark.remove"));
				removeBtn.addEventListener("click", () => {
					panel.bookmarkedNodes = panel.bookmarkedNodes.filter((id) => id !== nodeId);
					cb.markDirty();
					cb.rebuildPanel();
				});
			}
		},
		tHelp("help.bookmarks"),
		false,
		"star",
	);
}

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
			const hht = panel.hoverHighlightTypes ?? {
				forwardLinks: true,
				backlinks: true,
				sharedTags: false,
				sameFolder: false,
			};
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
			if (panel.nodeDisplayMode === "card") {
				_buildCardSubSettings(body, panel, cb);
			} else if (panel.nodeDisplayMode === "donut") {
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
// Node decoration section (semantic zoom, LOD, badges, rings)
// ---------------------------------------------------------------------------
export function buildNodeDecorationSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.nodeDecorations"),
		(body) => {
			// Semantic zoom
			addToggle(
				body,
				t("display.semanticZoom"),
				panel.semanticZoom,
				(v) => {
					panel.semanticZoom = v;
					cb.markDirty();
				},
				t("desc.semanticZoom"),
			);
			// Auto LOD (5-level)
			addToggle(
				body,
				t("display.autoLOD"),
				panel.renderThresholds?.autoLOD ?? false,
				(v) => {
					ensureRT(panel).autoLOD = v;
					cb.markDirty();
				},
				t("desc.autoLOD"),
			);
			// Tag badges
			addToggle(
				body,
				t("display.showTagBadges"),
				panel.showTagBadges,
				(v) => {
					panel.showTagBadges = v;
					cb.markDirty();
				},
				t("desc.showTagBadges"),
			);
			// Importance ring
			addToggle(
				body,
				t("display.showImportanceRing"),
				panel.showImportanceRing,
				(v) => {
					panel.showImportanceRing = v;
					cb.markDirty();
					cb.rebuildPanel();
				},
				t("desc.showImportanceRing"),
			);
			if (panel.showImportanceRing) {
				addSelect(
					body,
					t("display.importanceMetric"),
					[
						{ value: "degree", label: t("display.metricDegree") },
						{ value: "betweenness", label: t("display.metricBetweenness") },
						// pagerank option removed — not implemented, falls back to degree silently
					],
					panel.importanceMetric,
					(v) => {
						panel.importanceMetric = v as "degree" | "betweenness" | "pagerank";
						cb.markDirty();
					},
					t("desc.importanceMetric"),
				);
			}
			// Recency marker
			addToggle(
				body,
				t("display.showRecencyMarker"),
				panel.showRecencyMarker,
				(v) => {
					panel.showRecencyMarker = v;
					cb.markDirty();
					cb.rebuildPanel();
				},
				t("desc.showRecencyMarker"),
			);
			if (panel.showRecencyMarker) {
				addSlider(body, t("display.recencyDays"), 1, 90, 1, panel.recencyDays, (v) => {
					panel.recencyDays = v;
					cb.markDirty();
				});
			}
			// Definition field
			addTextInput(body, t("display.definitionField"), panel.definitionField, "e.g. definition, summary", (v) => {
				panel.definitionField = v.trim();
				cb.rebuildNodesInPlace();
			});
			// Gate: showNodeThumbnails only when nodes have image/thumbnail/cover metadata
			if (_ctx.hasImageMetaNodes) {
				addToggle(
					body,
					t("display.showNodeThumbnails") ?? "Node Thumbnails",
					panel.showNodeThumbnails,
					(v) => {
						panel.showNodeThumbnails = v;
						cb.refreshOverlays();
					},
					t("desc.showNodeThumbnails") ?? "Show frontmatter image as node thumbnail",
				);
			}
		},
		tHelp("help.nodeDecorations"),
		false,
		"sparkles",
	);
}

// ---------------------------------------------------------------------------
// Structure analysis section (ontology, patterns, ego layout)
// ---------------------------------------------------------------------------
export function buildStructureAnalysisSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.structureAnalysis"),
		(body) => {
			// Gate: ontology backbone requires ontology rules
			if (_ctx.settings.ontology?.rules?.length) {
				addToggle(
					body,
					t("display.ontologyBackbone"),
					panel.showOntologyBackbone ?? false,
					(v) => {
						panel.showOntologyBackbone = v;
						cb.markDirty();
						cb.rebuildPanel();
					},
					t("desc.ontologyBackbone"),
				);
			}
			// Gate: cluster label detail only when tag enclosures are active
			if (panel.showTagNodes && panel.tagDisplay === "enclosure") {
				addSelect(
					body,
					t("display.clusterLabelDetail"),
					[
						{ value: "minimal", label: t("display.clusterLabelMinimal") },
						{ value: "standard", label: t("display.clusterLabelStandard") },
						{ value: "detailed", label: t("display.clusterLabelDetailed") },
						{ value: "rich", label: t("display.clusterLabelRich") },
					],
					panel.clusterLabelDetail,
					(v) => {
						panel.clusterLabelDetail = v as "minimal" | "standard" | "detailed" | "rich";
						cb.markDirty();
					},
					t("desc.clusterLabelDetail"),
				);
			}
			addToggle(
				body,
				t("display.highlightPatterns"),
				panel.highlightPatterns,
				(v) => {
					panel.highlightPatterns = v;
					cb.markDirty();
				},
				t("desc.highlightPatterns"),
			);
			// R2: showBridgeNodes toggle removed — now controlled via analysisOverlay dropdown
			// Gate: focusLayout requires focusMode
			if (panel.focusMode) {
				addToggle(
					body,
					t("display.focusLayout"),
					panel.focusLayout,
					(v) => {
						panel.focusLayout = v;
						if (v && panel.localGraphCenter) {
							panel.clusterArrangement = "ego";
						}
						cb.doRender();
						cb.rebuildPanel();
					},
					t("desc.focusLayout"),
				);
			}
			// Gate: hierarchy breadcrumb requires local graph mode
			if (panel.localGraphCenter) {
				addToggle(
					body,
					t("display.showHierarchyBreadcrumb"),
					panel.showHierarchyBreadcrumb,
					(v) => {
						panel.showHierarchyBreadcrumb = v;
						cb.refreshOverlays();
					},
					t("desc.showHierarchyBreadcrumb"),
				);
			}
			// M2: Apply Ego Layout button — gate: needs a focused/highlighted node
			if (panel.focusNodeId || panel.localGraphCenter) {
				const egoBtn = body.createEl("button", { cls: "mod-cta", text: t("action.applyEgoLayout") });
				egoBtn.style.marginTop = "6px";
				egoBtn.style.width = "100%";
				egoBtn.addEventListener("click", () => {
					cb.applyEgoToVisible?.();
				});
			}
			// F5: Relation matrix
			addToggle(
				body,
				t("display.relationMatrix"),
				panel.showRelationMatrix,
				(v) => {
					panel.showRelationMatrix = v;
					cb.refreshOverlays();
				},
				t("desc.relationMatrix"),
			);
		},
		tHelp("help.structureAnalysis"),
		true,
		"git-branch",
	);
}

// ---------------------------------------------------------------------------
// Discovery section (analysis overlays, hierarchy, suggestions)
// ---------------------------------------------------------------------------
export function buildDiscoverySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.discovery"),
		(body) => {
			// R2: Consolidated analysis overlay dropdown
			addSelect(
				body,
				t("display.analysisOverlay"),
				[
					{ value: "off", label: t("analysis.off") },
					{ value: "bridges", label: t("analysis.bridges") },
					{ value: "entropy", label: t("analysis.entropy") },
					{ value: "gaps", label: t("analysis.gaps") },
					{ value: "missing", label: t("analysis.missing") },
					{ value: "density", label: t("analysis.density") },
					{ value: "all", label: t("analysis.all") },
				],
				panel.analysisOverlay ?? "off",
				(v) => {
					panel.analysisOverlay = v as PanelState["analysisOverlay"];
					// doRender() so GVC._applyAnalysisOverlay() runs (sets _showDensityHeatmap)
					cb.doRender();
				},
			);
			// S1: Hierarchy Tree Overlay — only when inheritance edges exist
			if (_ctx.hasInheritanceEdges) {
				addToggle(
					body,
					t("display.hierarchyTree"),
					panel.showHierarchyTree ?? false,
					(v) => {
						panel.showHierarchyTree = v;
						cb.markDirty();
						cb.rebuildPanel();
					},
					t("desc.hierarchyTree"),
				);
			}
			addToggle(
				body,
				t("display.similarSuggestions"),
				panel.showSimilarSuggestions,
				(v) => {
					panel.showSimilarSuggestions = v;
					cb.markDirty();
				},
				t("desc.similarSuggestions"),
			);
			addToggle(
				body,
				t("display.structureQuestions"),
				panel.showStructureQuestions,
				(v) => {
					panel.showStructureQuestions = v;
					cb.refreshOverlays();
				},
				t("desc.structureQuestions"),
			);
			addToggle(
				body,
				t("display.clusterCompare"),
				panel.showClusterCompare,
				(v) => {
					panel.showClusterCompare = v;
					cb.markDirty();
				},
				t("desc.clusterCompare"),
			);
		},
		tHelp("help.discovery"),
		true,
		"lightbulb",
	);
}

// ---------------------------------------------------------------------------
// Interaction section (multi-select, bulk actions)
// ---------------------------------------------------------------------------
export function buildInteractionSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.interaction"),
		(body) => {
			// Multi-select: show status label only when active
			if (panel.multiSelectNodeIds.length > 0) {
				addToggle(
					body,
					t("display.multiSelect"),
					true,
					(v) => {
						if (!v) {
							panel.multiSelectNodeIds = [];
							cb.rebuildPanel();
						}
						cb.markDirty();
					},
					t("desc.multiSelect"),
				);
			}

			// C6: Multi-select status and bulk actions
			if (panel.multiSelectNodeIds.length > 0) {
				const msInfo = body.createDiv({ cls: "setting-item" });
				msInfo.createEl("span", {
					text: t("label.selectedNodes").replace("{count}", String(panel.multiSelectNodeIds.length)),
					cls: "gi-ms-label",
				});

				const msRow = body.createDiv({ cls: "setting-item" });
				const addTagBtn = msRow.createEl("button", { text: t("action.addTag") });
				addTagBtn.addEventListener("click", () => {
					const tag = prompt("Tag:");
					if (tag) cb.bulkAddTag?.(panel.multiSelectNodeIds, tag);
				});

				const setFieldBtn = msRow.createEl("button", { text: t("action.setField") });
				setFieldBtn.style.marginLeft = "4px";
				setFieldBtn.addEventListener("click", () => {
					const field = prompt("Field name:");
					if (!field) return;
					const value = prompt("Value:");
					if (value !== null) cb.bulkSetField?.(panel.multiSelectNodeIds, field, value);
				});

				const clearBtn = msRow.createEl("button", { text: t("action.clearSelection") });
				clearBtn.style.marginLeft = "4px";
				clearBtn.addEventListener("click", () => {
					panel.multiSelectNodeIds = [];
					cb.rebuildPanel();
					cb.markDirty();
				});
			}
		},
		tHelp("help.interaction"),
		true,
		"mouse-pointer-2",
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
// Render thresholds section (performance tuning)
// ---------------------------------------------------------------------------
export function buildRenderThresholdsSection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.renderThresholds"),
		(body) => {
			const rt = mergeRenderThresholds(panel.renderThresholds);
			addSlider(
				body,
				t("render.cardTextNodeCount"),
				50,
				1000,
				50,
				rt.cardTextNodeCount,
				(v) => {
					ensureRT(panel).cardTextNodeCount = v;
					cb.markDirty();
				},
				t("render.cardTextNodeCountDesc"),
			);
			addSlider(
				body,
				t("render.gradientNodeCount"),
				100,
				2000,
				100,
				rt.gradientNodeCount,
				(v) => {
					ensureRT(panel).gradientNodeCount = v;
					cb.markDirty();
				},
				t("render.gradientNodeCountDesc"),
			);
			addSlider(
				body,
				t("render.glowNodeCount"),
				100,
				2000,
				100,
				rt.glowNodeCount,
				(v) => {
					ensureRT(panel).glowNodeCount = v;
					cb.markDirty();
				},
				t("render.glowNodeCountDesc"),
			);
			addSlider(
				body,
				t("render.gridLabelOffset"),
				0,
				40,
				1,
				rt.gridLabelOffset,
				(v) => {
					ensureRT(panel).gridLabelOffset = v;
					cb.markDirty();
				},
				t("render.gridLabelOffsetDesc"),
			);
			addToggle(
				body,
				t("render.showFpsMonitor"),
				rt.showFpsMonitor,
				(v) => {
					ensureRT(panel).showFpsMonitor = v;
					cb.markDirty();
					cb.wakeRenderLoop();
				},
				t("render.showFpsMonitorDesc"),
			);
			addSlider(
				body,
				t("render.labelCullCooldown") ?? "Label Cull Cooldown",
				1,
				12,
				1,
				rt.labelCullCooldown,
				(v) => {
					ensureRT(panel).labelCullCooldown = v;
					cb.markDirty();
					cb.announceA11y?.(`${t("render.labelCullCooldown") ?? "Label Cull Cooldown"}: ${v}`);
				},
				t("render.labelCullCooldownDesc"),
			);
			addSlider(
				body,
				t("render.highlightDimAlpha"),
				0,
				0.5,
				0.01,
				rt.highlightEdgeNonMatchAlpha,
				(v) => {
					ensureRT(panel).highlightEdgeNonMatchAlpha = v;
					cb.markDirty();
				},
				t("render.highlightDimAlphaDesc"),
			);
		},
		tHelp("help.renderThresholds"),
		true,
		"sliders",
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
	// FO: Card display presets
	addSelect(
		body,
		t("display.cardPreset") ?? "Card Preset",
		[
			{ value: "custom", label: t("display.cardPresetCustom") ?? "Custom" },
			{ value: "compact", label: t("display.cardPresetCompact") ?? "Compact" },
			{ value: "detailed", label: t("display.cardPresetDetailed") ?? "Detailed" },
			{ value: "full", label: t("display.cardPresetFull") ?? "Full" },
		],
		panel.cardDisplayConfig.preset ?? "custom",
		(v) => {
			panel.cardDisplayConfig.preset = v as "custom" | "compact" | "detailed" | "full";
			if (v === "compact") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "compact",
					fields: [],
					maxWidth: 80,
					showIcon: false,
					headerStyle: "plain",
				};
			} else if (v === "detailed") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "detailed",
					fields: ["category"],
					maxWidth: 150,
					showIcon: true,
					headerStyle: "table",
				};
			} else if (v === "full") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "full",
					fields: ["category", "node_type", "tags"],
					maxWidth: 200,
					showIcon: true,
					headerStyle: "table",
				};
			}
			cb.doRenderKeepPanel();
			cb.rebuildPanel();
		},
	);
	addTextInput(
		body,
		t("display.cardFields"),
		panel.cardDisplayConfig.fields.join(", "),
		"e.g. category, tags, node_type",
		(v) => {
			panel.cardDisplayConfig.fields = v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			cb.doRenderKeepPanel();
		},
	);
	addSlider(body, t("display.cardMaxWidth"), 60, 300, 10, panel.cardDisplayConfig.maxWidth ?? 120, (v) => {
		panel.cardDisplayConfig.maxWidth = v;
		cb.doRenderKeepPanel();
	});
	addToggle(body, t("display.cardShowIcon"), panel.cardDisplayConfig.showIcon ?? false, (v) => {
		panel.cardDisplayConfig.showIcon = v;
		cb.doRenderKeepPanel();
	});
	addSelect(
		body,
		t("display.cardHeaderStyle"),
		[
			{ value: "plain", label: t("display.cardStylePlain") },
			{ value: "table", label: t("display.cardStyleTable") },
		],
		panel.cardDisplayConfig.headerStyle ?? "plain",
		(v) => {
			panel.cardDisplayConfig.headerStyle = v as "plain" | "table";
			cb.doRenderKeepPanel();
		},
	);
	addSelect(
		body,
		t("display.cardFieldFormat") ?? "Field Format",
		[
			{ value: "key-value", label: "Key: Value" },
			{ value: "value-only", label: "Value Only" },
		],
		panel.cardDisplayConfig.fieldFormat ?? "key-value",
		(v) => {
			panel.cardDisplayConfig.fieldFormat = v as "key-value" | "value-only";
			cb.doRenderKeepPanel();
		},
	);
	// FT: Card body max lines
	const rtCard = mergeRenderThresholds(panel.renderThresholds);
	addSlider(body, t("display.cardBodyLines") ?? "Body Lines", 0, 10, 1, rtCard.cardBodyMaxLines, (v) => {
		ensureRT(panel).cardBodyMaxLines = v;
		cb.recalcNodeRadii();
		cb.doRenderKeepPanel();
	});
	// HM: Card content scale — log-based size boost from body length
	addSlider(
		body,
		t("display.cardContentScale") ?? "Card Size by Content",
		0,
		2.0,
		0.1,
		rtCard.cardContentScale,
		(v) => {
			ensureRT(panel).cardContentScale = v;
			cb.recalcNodeRadii();
			cb.markDirty();
			cb.announceA11y?.(`${t("display.cardContentScale") ?? "Card Size by Content"}: ${(v * 100).toFixed(0)}%`);
		},
		t("desc.cardContentScale"),
	);
	// GE: Card background opacity
	const crcGE = panel.cardRenderConfig ?? {};
	addSlider(
		body,
		t("display.cardBgOpacity") ?? "Card Opacity",
		0.1,
		1.0,
		0.05,
		crcGE.plainCardFillAlpha ?? 0.8,
		(v) => {
			if (!panel.cardRenderConfig) panel.cardRenderConfig = {};
			panel.cardRenderConfig.plainCardFillAlpha = v;
			cb.doRenderKeepPanel();
		},
	);
	// FX: Card body font size
	addSlider(body, t("display.cardBodyFontSize") ?? "Body Font Size", 4, 16, 1, rtCard.cardBodyFontSize, (v) => {
		ensureRT(panel).cardBodyFontSize = v;
		cb.recalcNodeRadii();
		cb.doRenderKeepPanel();
	});
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
