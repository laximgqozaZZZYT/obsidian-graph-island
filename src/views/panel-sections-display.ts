/**
 * panel-sections-display.ts
 *
 * Extracted display-tab section builders from PanelBuilder.ts to reduce
 * god-object size.  Each function builds one collapsible section inside
 * the Display panel tab.
 */
import { mergeRenderThresholds } from "../types";
import { t, tHelp } from "../i18n";
import { addSlider, addToggle, addSelect } from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection, addAdvancedGroup } from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Edge Display section builder
// ---------------------------------------------------------------------------
export function buildEdgeDisplaySection(tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks): void {
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
