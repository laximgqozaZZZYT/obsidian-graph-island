/**
 * Extracted panel section builders — moved from PanelBuilder.ts to reduce file size.
 * Each function builds a collapsible section inside the panel UI.
 */
import { Menu, TFile } from "obsidian";
import { t, tHelp } from "../i18n";
import { mergeRenderThresholds } from "../types";
import type { NodeShape } from "../utils/node-shapes";
import { ALL_SHAPES } from "../utils/node-shapes";
import type { PanelCallbacks, PanelContext, PanelState, NodeTreeEntry } from "./PanelBuilder";
import { ensureRT, buildSection, addAdvancedGroup, _getNodeDirStates, _saveNodeDirStates } from "./PanelBuilder";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";

// ---------------------------------------------------------------------------
// Node Advanced Controls — extracted to reduce complexity of the outer arrow fn
// ---------------------------------------------------------------------------
function _buildNodeAdvancedControls(
	adv: HTMLElement,
	panel: PanelState,
	cb: PanelCallbacks,
): void {
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
	_buildNodeHoverAndShapeControls(adv, panel, cb);
}

function _buildNodeHoverAndShapeControls(
	adv: HTMLElement,
	panel: PanelState,
	cb: PanelCallbacks,
): void {
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
	// Hover edge type filter — which edge types to follow during hover BFS
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
	const hoverTypeEntries: [string, string][] = [
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
		const hetRec = het as Record<string, boolean>;
		addToggle(adv, label, hetRec[key] ?? false, (v) => {
			if (!panel.hoverEdgeTypes) panel.hoverEdgeTypes = { ...het };
			(panel.hoverEdgeTypes as Record<string, boolean>)[key] = v;
			cb.rebuildHoverAdj();
			cb.applyHover();
			cb.markDirty();
		});
	}
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

// ---------------------------------------------------------------------------
// Node Display Section (was _buildNodeDisplaySection)
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
		(body: HTMLElement) => {
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
			addAdvancedGroup(body, (adv: HTMLElement) => _buildNodeAdvancedControls(adv, panel, cb));
		},
		tHelp("help.displayNodes"),
		false,
		"circle-dot",
	);
}

// ---------------------------------------------------------------------------
// Edge Display Section (was _buildEdgeDisplaySection)
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
		(body: HTMLElement) => {
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
			addAdvancedGroup(body, (adv: HTMLElement) => {
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
// Nodes Tab (was _buildNodesTab)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// DirNode tree type (used by buildNodesTab and helpers)
// ---------------------------------------------------------------------------
interface DirNode {
	children: Map<string, DirNode>;
	files: NodeTreeEntry[];
}

function countFiles(dir: DirNode): number {
	let count = dir.files.length;
	for (const child of dir.children.values()) count += countFiles(child);
	return count;
}

function collectDirIds(dir: DirNode): string[] {
	const ids: string[] = dir.files.map((f) => f.id);
	for (const child of dir.children.values()) ids.push(...collectDirIds(child));
	return ids;
}

function buildDirTree(entries: NodeTreeEntry[]): DirNode {
	const root: DirNode = { children: new Map(), files: [] };
	for (const entry of entries) {
		const parts = entry.path.split("/");
		parts.pop();
		let cur = root;
		for (const dir of parts) {
			if (!cur.children.has(dir)) cur.children.set(dir, { children: new Map(), files: [] });
			cur = cur.children.get(dir)!;
		}
		cur.files.push(entry);
	}
	return root;
}

function renderNodeDir(
	parent: HTMLElement,
	dir: DirNode,
	path: string,
	depth: number,
	opts: {
		excludeSet: Set<string>;
		hoveredId: string | null;
		fwdLinks: Set<string>;
		bkLinks: Set<string>;
		panel: PanelState;
		ctx: PanelContext;
		cb: PanelCallbacks;
	},
) {
	const { excludeSet, panel, cb } = opts;
	const sortedDirs = [...dir.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const sortedFiles = [...dir.files].sort((a, b) => a.label.localeCompare(b.label));

	for (const [name, child] of sortedDirs) {
		const dirEl = parent.createDiv({ cls: "gi-node-dir" });
		const header = dirEl.createDiv({ cls: "gi-node-dir-header" });
		header.style.cssText = `padding:2px 0 2px ${depth * 12}px;cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-muted);`;
		// EN: Folder-level checkbox for batch exclude
		const dirIds = collectDirIds(child);
		const allExcluded = dirIds.length > 0 && dirIds.every((id) => excludeSet.has(id));
		const dirCb = header.createEl("input", { type: "checkbox" });
		dirCb.checked = !allExcluded;
		dirCb.style.cssText = "width:11px;height:11px;margin:0;cursor:pointer;";
		dirCb.addEventListener("click", (e) => {
			e.stopPropagation();
			const ids = collectDirIds(child);
			if (dirCb.checked) {
				panel.excludeNodes = (panel.excludeNodes ?? []).filter((id) => !ids.includes(id));
			} else {
				const excl = new Set(panel.excludeNodes ?? []);
				for (const id of ids) excl.add(id);
				panel.excludeNodes = [...excl];
			}
			cb.invalidateDataKeepPanel();
		});
		const arrow = header.createEl("span", { text: ">" });
		arrow.style.cssText = "font-size:9px;transition:transform 0.15s;";
		header.createEl("span", { text: name });
		const fileCount = countFiles(child);
		header.createEl("span", { text: `(${fileCount})`, cls: "gi-node-count" });
		header.querySelector(".gi-node-count")!.setAttribute("style", "font-size:9px;color:var(--text-faint);");

		const body = dirEl.createDiv({ cls: "gi-node-dir-body" });
		const dirPath = path + name;
		const savedOpen = _getNodeDirStates()[dirPath];
		body.style.display = savedOpen ? "" : "none";
		if (savedOpen) arrow.style.transform = "rotate(90deg)";

		header.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).tagName === "INPUT") return;
			const open = body.style.display !== "none";
			body.style.display = open ? "none" : "";
			arrow.style.transform = open ? "" : "rotate(90deg)";
			const states = _getNodeDirStates();
			if (open) delete states[dirPath];
			else states[dirPath] = true;
			_saveNodeDirStates(states);
		});

		renderNodeDir(body, child, path + name + "/", depth + 1, opts);
	}

	for (const entry of sortedFiles) {
		renderNodeFileRow(parent, entry, depth, opts);
	}
}

function renderNodeFileRow(
	parent: HTMLElement,
	entry: NodeTreeEntry,
	depth: number,
	opts: {
		excludeSet: Set<string>;
		hoveredId: string | null;
		fwdLinks: Set<string>;
		bkLinks: Set<string>;
		panel: PanelState;
		ctx: PanelContext;
		cb: PanelCallbacks;
	},
) {
	const { excludeSet, hoveredId, fwdLinks, bkLinks, panel, ctx, cb } = opts;
	const row = parent.createDiv({ cls: "gi-node-row" });
	row.style.cssText = `padding:1px 4px 1px ${depth * 12}px;display:flex;align-items:center;gap:4px;cursor:pointer;border-radius:3px;`;
	row.dataset.nodeId = entry.id;

	const cb2 = row.createEl("input", { type: "checkbox" });
	cb2.checked = !excludeSet.has(entry.id);
	cb2.style.cssText = "width:12px;height:12px;margin:0;cursor:pointer;";
	cb2.addEventListener("change", (e) => {
		e.stopPropagation();
		cb.toggleNodeVisibility(entry.id);
	});

	const label = row.createEl("span", { text: entry.label, cls: "gi-node-label" });
	label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

	if (!entry.isVisible) {
		row.style.opacity = "0.4";
	}
	if (entry.id === hoveredId) {
		row.style.background = "var(--interactive-accent)";
		row.style.color = "var(--text-on-accent)";
	} else if (fwdLinks.has(entry.id)) {
		row.style.background = "rgba(34, 197, 94, 0.15)";
		label.style.fontWeight = "600";
	} else if (bkLinks.has(entry.id)) {
		row.style.background = "rgba(59, 130, 246, 0.15)";
		label.style.fontWeight = "600";
	}

	row.addEventListener("click", (e) => {
		if (e.ctrlKey || e.metaKey) {
			const idx = panel.multiSelectNodeIds.indexOf(entry.id);
			if (idx >= 0) panel.multiSelectNodeIds.splice(idx, 1);
			else panel.multiSelectNodeIds.push(entry.id);
			row.classList.toggle("gi-node-selected");
		} else {
			cb.jumpToNode(entry.id);
		}
	});
	// EU: Right-click context menu
	row.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Jump to Node")
				.setIcon("locate")
				.onClick(() => cb.jumpToNode(entry.id)),
		);
		menu.addItem((item) =>
			item
				.setTitle(excludeSet.has(entry.id) ? "Show" : "Hide")
				.setIcon("eye-off")
				.onClick(() => cb.toggleNodeVisibility(entry.id)),
		);
		const isBm = (panel.bookmarkedNodes ?? []).includes(entry.id);
		menu.addItem((item) =>
			item
				.setTitle(isBm ? "Remove Bookmark" : "Bookmark")
				.setIcon("bookmark")
				.onClick(() => {
					if (isBm) panel.bookmarkedNodes = panel.bookmarkedNodes.filter((id) => id !== entry.id);
					else {
						if (!panel.bookmarkedNodes) panel.bookmarkedNodes = [];
						panel.bookmarkedNodes.push(entry.id);
					}
					cb.invalidateDataKeepPanel();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle("Open File")
				.setIcon("file-text")
				.onClick(() => {
					const file = ctx.app.vault.getAbstractFileByPath(entry.id);
					if (file instanceof TFile) ctx.app.workspace.getLeaf(false).openFile(file);
				}),
		);
		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	});
}

function buildNodeLegendAndExport(tabEl: HTMLElement, entries: NodeTreeEntry[]) {
	const legend = tabEl.createDiv({ cls: "gi-node-legend" });
	legend.style.cssText =
		"padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;";
	const addLegendItem = (color: string, text: string) => {
		const item = legend.createEl("span");
		item.style.cssText = `display:inline-flex;align-items:center;gap:2px;`;
		const dot = item.createEl("span");
		dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;`;
		item.createEl("span", { text });
	};
	addLegendItem("var(--interactive-accent)", t("nodes.hovered") ?? "Hovered");
	addLegendItem("rgba(34,197,94,0.6)", t("nodes.forwardLink") ?? "Link");
	addLegendItem("rgba(59,130,246,0.6)", t("nodes.backlink") ?? "Backlink");

	// EZ: CSV export button
	const exportBtn = legend.createEl("button", { text: t("export.csvBtn"), cls: "gi-node-export-btn" });
	exportBtn.style.cssText = "font-size:9px;padding:1px 6px;cursor:pointer;margin-left:auto;border-radius:3px;";
	exportBtn.addEventListener("click", () => {
		const rows = ["id,label,path,visible"];
		for (const e of entries) {
			rows.push(`"${e.id}","${e.label}","${e.path}",${e.isVisible}`);
		}
		const csv = rows.join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `graph-island-nodes-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	});

	// EM: Inject hover sync CSS
	if (!tabEl.querySelector("style.gi-node-hover-css")) {
		const style = document.createElement("style");
		style.className = "gi-node-hover-css";
		style.textContent = `.gi-node-hovered{background:var(--interactive-accent)!important;color:var(--text-on-accent)!important;}.gi-node-linked{background:rgba(34,197,94,0.15)!important;font-weight:600;}.gi-node-selected{background:rgba(139,92,246,0.2)!important;border-left:2px solid var(--interactive-accent);}`;
		tabEl.prepend(style);
	}
}

export function buildNodesTab(tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks): void {
	const entries = cb.getNodeTreeData();
	const hoveredId = cb.getHoveredNodeId();
	const excludeSet = new Set(panel.excludeNodes ?? []);

	const fwdLinks = hoveredId ? new Set(cb.getForwardLinks(hoveredId)) : new Set<string>();
	const bkLinks = hoveredId ? new Set(cb.getBacklinks(hoveredId)) : new Set<string>();

	const root = buildDirTree(entries);

	// EP: Stats summary bar
	const visibleCount = entries.filter((e) => e.isVisible).length;
	const hiddenCount = excludeSet.size;
	const statsBar = tabEl.createDiv({ cls: "gi-node-stats" });
	statsBar.style.cssText = "padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;";
	statsBar.createEl("span", { text: `${entries.length} total` });
	statsBar.createEl("span", { text: `${visibleCount} visible` });
	if (hiddenCount > 0) {
		const hidSpan = statsBar.createEl("span", { text: `${hiddenCount} hidden` });
		hidSpan.style.color = "var(--text-error)";
	}

	// FA: Sort selector + Search filter
	const filterWrap = tabEl.createDiv({ cls: "gi-node-tree-filter" });
	filterWrap.style.cssText = "padding:4px 8px;display:flex;gap:4px;align-items:center;";
	const filterInput = filterWrap.createEl("input", {
		type: "text",
		placeholder: t("nodes.filterPlaceholder") ?? "Filter nodes...",
		cls: "gi-node-filter-input",
	});
	filterInput.style.cssText =
		"flex:1;padding:4px 6px;font-size:11px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);";
	const sortSelect = filterWrap.createEl("select", { cls: "gi-node-sort" });
	sortSelect.style.cssText =
		"font-size:10px;padding:2px;border-radius:3px;background:var(--background-primary);border:1px solid var(--background-modifier-border);";
	for (const [val, label] of [
		["name", "A-Z"],
		["path", "Path"],
		["visible", "Visible"],
		["degree", "Degree"],
	]) {
		sortSelect.createEl("option", { value: val, text: label });
	}
	const degreeLookup = new Map<string, number>();
	for (const e of entries) {
		const fwd = cb.getForwardLinks(e.id).length;
		const bk = cb.getBacklinks(e.id).length;
		degreeLookup.set(e.id, fwd + bk);
	}
	sortSelect.addEventListener("change", () => {
		const mode = sortSelect.value;
		const rows = [...treeContainer.querySelectorAll(".gi-node-row")] as HTMLElement[];
		rows.sort((a, b) => {
			const aId = a.dataset.nodeId ?? "";
			const bId = b.dataset.nodeId ?? "";
			if (mode === "visible") {
				const aVis = !excludeSet.has(aId) ? 0 : 1;
				const bVis = !excludeSet.has(bId) ? 0 : 1;
				return aVis - bVis || aId.localeCompare(bId);
			}
			if (mode === "degree") {
				return (degreeLookup.get(bId) ?? 0) - (degreeLookup.get(aId) ?? 0);
			}
			if (mode === "path") return aId.localeCompare(bId);
			return (a.textContent ?? "").localeCompare(b.textContent ?? "");
		});
		for (const row of rows) treeContainer.appendChild(row);
	});

	const treeContainer = tabEl.createDiv({ cls: "gi-node-tree" });
	treeContainer.style.cssText = "overflow-y:auto;max-height:400px;font-size:11px;padding:0 4px;";

	const renderOpts = { excludeSet, hoveredId, fwdLinks, bkLinks, panel, ctx, cb };
	renderNodeDir(treeContainer, root, "", 0, renderOpts);

	// Filter logic
	filterInput.addEventListener("input", () => {
		const q = filterInput.value.toLowerCase().trim();
		const rows = treeContainer.querySelectorAll(".gi-node-row");
		for (const row of Array.from(rows)) {
			const id = (row as HTMLElement).dataset.nodeId ?? "";
			const text = (row as HTMLElement).textContent?.toLowerCase() ?? "";
			(row as HTMLElement).style.display = q && !text.includes(q) && !id.toLowerCase().includes(q) ? "none" : "";
		}
		if (q) {
			const dirs = treeContainer.querySelectorAll(".gi-node-dir");
			for (const dir of Array.from(dirs)) {
				const body = dir.querySelector(".gi-node-dir-body") as HTMLElement;
				const arrow = dir.querySelector(".gi-node-dir-header span") as HTMLElement;
				if (body) body.style.display = "";
				if (arrow) arrow.style.transform = "rotate(90deg)";
			}
		}
	});

	buildNodeLegendAndExport(tabEl, entries);
}
