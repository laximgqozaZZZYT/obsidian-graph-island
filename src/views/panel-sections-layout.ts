// ---------------------------------------------------------------------------
// Layout & Settings tab section builders — extracted from PanelBuilder.ts
// ---------------------------------------------------------------------------
import type {
	AxisConfig,
	ClusterArrangement,
	ClusterGroupArrangement,
	CoordinateLayout,
	CoordinateSystem,
} from "../types";
import { mergeRenderThresholds, ontologyToRules, rulesToOntologyFields } from "../types";
import { t, tHelp } from "../i18n";
import {
	TAG_DISPLAY_ENCLOSURE,
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_TIMELINE,
	SOURCE_PROPERTY,
	TRANSFORM_EVEN_DIVIDE,
} from "../constants";
import { ARRANGEMENT_PRESETS, findMatchingPreset } from "../layouts/coordinate-presets";
import { importPreset, applyPreset, type PresetMigrationInfo } from "../utils/presets";
import { showToast } from "../utils/toast";
import {
	buildDualRangeSlider,
	addSlider,
	addToggle,
	addSelect,
	attachDatalist,
	renderClusterRuleList,
	renderDirectionalGravityList,
	renderSortRuleList,
	renderOntologyRule,
	renderCustomMappings,
	renderTagRelations,
} from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection } from "./PanelBuilder";
import {
	addAutoFitToggle,
	addAxisTitlesToggle,
	addClusterGravitySliders,
	addCustomGridControls,
} from "./panel-sections-layout-helpers";

// Re-export for internal consumption by PanelBuilder call sites
export { syncArrangementFromLayout, getPreset, getOrCreateCoordLayout };

// ---------------------------------------------------------------------------
// Shared context for cluster-arrangement helpers
// ---------------------------------------------------------------------------
export interface ClusterSectionCtx {
	body: HTMLElement;
	panel: PanelState;
	cb: PanelCallbacks;
	ctx: PanelContext;
	/** Slider elements that should be disabled when autoFit is ON */
	spacingSliders: HTMLElement[];
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * After any coordinate-layout field is changed, sync the arrangement dropdown.
 * If the new layout matches a known preset, switch to that preset and clear the override.
 * Otherwise, switch to "custom".
 */
function syncArrangementFromLayout(panel: PanelState): void {
	if (!panel.coordinateLayout) return;
	const match = findMatchingPreset(panel.coordinateLayout);
	panel.clusterArrangement = match;
}

/** Safe accessor for ARRANGEMENT_PRESETS — returns grid preset as fallback */
function getPreset(arrangement: ClusterArrangement): CoordinateLayout {
	return ARRANGEMENT_PRESETS[arrangement] ?? ARRANGEMENT_PRESETS.grid;
}

/** Get the current coordinate layout, falling back to the preset for the current arrangement. */
function getOrCreateCoordLayout(panel: PanelState): CoordinateLayout {
	return panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
}

// ---------------------------------------------------------------------------
// Settings tab section builders
// ---------------------------------------------------------------------------

export function buildOntologySection(
	tabEl: HTMLElement,
	_panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.ontology"),
		(body) => {
			const s = ctx.settings;
			// Initialize rules from legacy fields if not present
			if (!s.ontology.rules || s.ontology.rules.length === 0) {
				s.ontology.rules = ontologyToRules(s.ontology);
			}
			const rules = s.ontology.rules;

			let debounceTimer: ReturnType<typeof setTimeout> | undefined;
			const save = () => {
				rulesToOntologyFields(rules, s.ontology);
				s.ontology.rules = rules;
				ctx.saveSettings();
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => cb.invalidateDataKeepPanel(), 2000);
			};

			const listEl = body.createDiv({ cls: "gi-ont-rules" });

			function renderRules() {
				listEl.empty();
				for (let i = 0; i < rules.length; i++) {
					renderOntologyRule(listEl, rules, i, cb, save, () => renderRules());
				}
				// Add button
				const addBtn = listEl.createEl("button", {
					cls: "gi-ont-add-btn",
					text: `+ ${t("settings.ontAddRule")}`,
				});
				addBtn.addEventListener("click", () => {
					rules.push({ forward: "", relation: "is-a", reverse: "" });
					save();
					renderRules();
				});
			}
			renderRules();

			addToggle(
				body,
				t("settings.tagHierarchy"),
				s.ontology.useTagHierarchy,
				(v) => {
					s.ontology.useTagHierarchy = v;
					ctx.saveSettings();
					cb.invalidateDataKeepPanel();
				},
				t("desc.tagHierarchy"),
			);
		},
		tHelp("help.ontology"),
		false,
		"network",
	);
}

export function buildTagRelationsSection(
	tabEl: HTMLElement,
	_panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.tagRelations"),
		(body) => {
			const tagRelListEl = body.createDiv({ cls: "gi-tag-relations-list" });
			renderTagRelations(tagRelListEl, ctx.settings, ctx, cb);
		},
		tHelp("help.tagRelations"),
		true,
		"tag",
	);
}

// ---------------------------------------------------------------------------
// Sample preset selector
// ---------------------------------------------------------------------------

/** Sample preset names (filenames without .json extension) */
const SAMPLE_PRESET_NAMES = [
	"01-panorama-overview",
	"02-dense-cluster",
	"03-character-network",
	"04-shakespeare-compare",
	"05-mythology-pantheon",
	"06-sangokushi-factions",
	"07-tag-taxonomy",
	"08-sequence-tracker",
	"09-minimalist",
	"10-maximalist",
	"11-bible-scholar",
	"12-genji-reader",
	"13-battle-analyzer",
	"14-dialogue-theater",
	"15-orphan-hunter",
	"16-edge-bundle-art",
	"17-ontology-mapper",
	"18-folder-compare",
	"19-hub-discovery",
	"20-arabian-nights",
	"21-filled-hexagon",
	"22-timeline-ranged",
	"23-spiral-galaxy",
	"24-baobab-sunburst",
	"25-rose-curve",
];

/** Build the sample preset selector dropdown at the top of settings tab */
export function buildSamplePresetSelector(
	tabEl: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	const section = tabEl.createDiv({ cls: "gi-panel-section" });
	section.createEl("div", { cls: "gi-panel-section-title", text: t("preset.samplePresets") });
	const body = section.createDiv({ cls: "gi-panel-section-body" });

	const row = body.createDiv({ cls: "gi-panel-row" });
	row.createEl("span", { cls: "gi-panel-label", text: t("preset.samplePresetsDesc") });
	const select = row.createEl("select", { cls: "gi-panel-select" });
	const defaultOpt = select.createEl("option", { text: t("preset.selectSample"), value: "" });
	defaultOpt.selected = true;

	for (const name of SAMPLE_PRESET_NAMES) {
		select.createEl("option", { text: name, value: name });
	}

	select.addEventListener("change", async () => {
		const name = select.value;
		if (!name) return;

		try {
			const app = ctx.app;
			const pluginDir = ctx.pluginDir ?? ".obsidian/plugins/graph-island";
			const filePath = `${pluginDir}/samples/${name}.json`;
			const json = await app.vault.adapter.read(filePath);
			const info: PresetMigrationInfo = { migratedFields: [], removedFields: [] };
			const preset = importPreset(json, info);
			const merged = applyPreset(panel, preset);
			Object.assign(panel, merged);
			cb.invalidateData();
			if (panel.presetZoomLevel > 0) {
				ctx.timers.setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
			}
			cb.rebuildPanel();
			showToast(t("preset.sampleLoaded").replace("{name}", name));
		} catch (_e) {
			showToast(t("preset.sampleLoadError"));
		}

		// Reset dropdown to placeholder
		select.value = "";
	});
}

// ---------------------------------------------------------------------------
// Cluster arrangement section helpers
// ---------------------------------------------------------------------------

/** Arrangement pattern dropdown */
export function buildArrangementPatternSelect(s: ClusterSectionCtx): void {
	addSelect(
		s.body,
		t("cluster.pattern"),
		[
			{ value: "inherit", label: t("cluster.inherit") },
			{ value: "concentric", label: t("cluster.concentric") },
			{ value: "radial", label: t("cluster.radial") },
			{ value: "phyllotaxis", label: t("cluster.phyllotaxis") },
			{ value: "grid", label: t("cluster.grid") },
			{ value: "triangle", label: t("cluster.triangle") },
			{ value: "random", label: t("cluster.random") },
			{ value: "timeline", label: t("cluster.timeline") },
			{ value: "custom", label: t("cluster.custom") },
			{ value: "ego", label: t("cluster.ego") },
		],
		s.panel.clusterArrangement,
		(v) => {
			s.panel.clusterArrangement = v as ClusterArrangement;
			const preset = getPreset(v as ClusterArrangement);
			// Preserve grid config if currently active
			const prevGrid = s.panel.coordinateLayout?.grid;
			s.panel.coordinateLayout = {
				...preset,
				...(prevGrid ? { grid: prevGrid } : {}),
			};
			s.cb.applyClusterForce();
			s.cb.rebuildPanel();
			s.cb.restartSimulation(1.0);
			// A11y: announce layout change
			s.cb.announceA11y?.(`${t("a11y.layoutChanged") ?? "Layout"}: ${v}`);
		},
		t("desc.clusterPattern"),
	);
}

/** Concentric orbit toggles (only shown for concentric arrangement) */
export function buildConcentricOptions(s: ClusterSectionCtx): void {
	if (s.panel.clusterArrangement !== ARRANGEMENT_CONCENTRIC) return;
	addToggle(s.body, t("concentric.showOrbitRings"), s.panel.showOrbitRings, (v) => {
		s.panel.showOrbitRings = v;
		s.cb.markDirty();
	});
	addToggle(s.body, t("concentric.autoRotate"), s.panel.orbitAutoRotate, (v) => {
		s.panel.orbitAutoRotate = v;
		if (v) s.cb.startOrbitAnimation();
		else s.cb.stopOrbitAnimation();
	});
}

/** Coordinate system, axis inputs, preview, expression library, constants, perGroup, polar range */
export function buildCoordinateControls(
	s: ClusterSectionCtx,
	buildAxisTextInput: (
		body: HTMLElement,
		label: string,
		axis: AxisConfig,
		idx: 1 | 2,
		panel: PanelState,
		cb: PanelCallbacks,
		ctx: PanelContext,
		suggestions: string[],
	) => void,
	buildCoordPreview: (body: HTMLElement, layout: CoordinateLayout) => void,
	buildExprLibrary: (body: HTMLElement, panel: PanelState, cb: PanelCallbacks) => void,
	buildConstantsUI: (body: HTMLElement, panel: PanelState, cb: PanelCallbacks) => void,
	getAxisSourceSuggestions: (ctx: PanelContext) => string[],
): void {
	const { body, panel, cb, ctx } = s;
	const coordLayout = panel.coordinateLayout ?? getPreset(panel.clusterArrangement);

	addSelect(
		body,
		t("coord.system"),
		[
			{ value: "cartesian", label: t("coord.cartesian") },
			{ value: "polar", label: t("coord.polar") },
		],
		coordLayout.system,
		(v) => {
			const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
			panel.coordinateLayout = { ...base, system: v as CoordinateSystem };
			syncArrangementFromLayout(panel);
			cb.applyClusterForce();
			cb.rebuildPanel();
			cb.restartSimulation(0.5);
		},
		t("desc.coordSystem"),
	);

	const axis1Label = coordLayout.system === "polar" ? "r" : "X";
	const axis2Label = coordLayout.system === "polar" ? "θ" : "Y";

	const axisSuggestions = getAxisSourceSuggestions(ctx);

	buildAxisTextInput(body, `${axis1Label}:`, coordLayout.axis1, 1, panel, cb, ctx, axisSuggestions);
	buildAxisTextInput(body, `${axis2Label}:`, coordLayout.axis2, 2, panel, cb, ctx, axisSuggestions);

	// Coordinate function preview plot
	buildCoordPreview(body, coordLayout);

	// Expression library (preset formulas)
	buildExprLibrary(body, panel, cb);

	// Constants management
	buildConstantsUI(body, panel, cb);

	addToggle(
		body,
		t("coord.perGroup"),
		coordLayout.perGroup,
		(v) => {
			const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
			panel.coordinateLayout = { ...base, perGroup: v };
			syncArrangementFromLayout(panel);
			cb.applyClusterForce();
			cb.rebuildPanel();
			cb.restartSimulation(0.5);
		},
		t("desc.perGroup"),
	);

	if (coordLayout.system === "polar" && coordLayout.axis2.transform.kind === TRANSFORM_EVEN_DIVIDE) {
		addSlider(
			body,
			`${axis2Label} ${t("coord.range")} (°)`,
			30,
			360,
			10,
			coordLayout.axis2.transform.totalRange,
			(v) => {
				const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
				panel.coordinateLayout = {
					...base,
					axis2: {
						...base.axis2,
						transform: { kind: "even-divide", totalRange: v },
					},
				};
				syncArrangementFromLayout(panel);
				cb.applyClusterForce();
				cb.restartSimulation(0.5);
			},
			"Angle range for polar arrangement",
		);
	}
}

/** Auto-fit toggle, guide lines, group grid, and custom grid settings */
export function buildAutoFitAndGuides(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;

	addAutoFitToggle(s);

	// --- Grid & Guide section ---
	addToggle(
		body,
		t("display.dotGrid"),
		panel.showDotGrid,
		(v) => {
			panel.showDotGrid = v;
			cb.markDirty();
		},
		t("desc.dotGrid"),
	);

	addCustomGridControls(s);
	addAxisTitlesToggle(s);
}

/** Node spacing, group arrangement, group size/spacing, cluster gravity, edge bundle */
export function buildSpacingAndGroupArrangement(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;

	let spacingDebounce: ReturnType<typeof setTimeout> | undefined;
	const debouncedClusterForce = () => {
		clearTimeout(spacingDebounce);
		spacingDebounce = setTimeout(() => {
			cb.applyClusterForce(false);
			cb.restartSimulation(0.5);
		}, 100);
	};

	s.spacingSliders.push(
		addSlider(
			body,
			t("cluster.nodeSpacing"),
			1,
			10,
			0.5,
			panel.clusterNodeSpacing,
			(v) => {
				panel.clusterNodeSpacing = v;
				debouncedClusterForce();
			},
			t("desc.nodeSpacing"),
		),
	);

	// Inter-group arrangement dropdown
	addSelect(
		body,
		t("cluster.groupArrangement"),
		[
			{ value: "auto", label: t("cluster.groupArrangementAuto") },
			{ value: "circle", label: t("cluster.groupArrangementCircle") },
			{ value: "horizontal", label: t("cluster.groupArrangementHorizontal") },
			{ value: "vertical", label: t("cluster.groupArrangementVertical") },
			{ value: "concentric", label: t("cluster.groupArrangementConcentric") },
			{ value: "grid", label: t("cluster.groupArrangementGrid") },
		],
		panel.clusterGroupArrangement,
		(v) => {
			panel.clusterGroupArrangement = v as ClusterGroupArrangement;
			cb.applyClusterForce();
			cb.restartSimulation(1.0);
		},
		t("desc.groupArrangement"),
	);

	s.spacingSliders.push(
		addSlider(
			body,
			t("cluster.groupSize"),
			0.5,
			5,
			0.25,
			panel.clusterGroupScale,
			(v) => {
				panel.clusterGroupScale = v;
				debouncedClusterForce();
			},
			t("desc.groupSize"),
		),
	);
	s.spacingSliders.push(
		addSlider(
			body,
			t("cluster.groupSpacing"),
			0.5,
			5,
			0.25,
			panel.clusterGroupSpacing,
			(v) => {
				panel.clusterGroupSpacing = v;
				debouncedClusterForce();
			},
			t("desc.groupSpacing"),
		),
	);

	// Apply initial disabled state for autoFit
	for (const el of s.spacingSliders) {
		el.style.opacity = panel.autoFit ? "0.5" : "";
		el.style.pointerEvents = panel.autoFit ? "none" : "";
	}

	// Cluster gravity sliders (only when groupBy is active)
	addClusterGravitySliders(s, debouncedClusterForce);

	addSlider(
		body,
		t("cluster.edgeBundleStrength"),
		0,
		1,
		0.05,
		panel.edgeBundleStrength,
		(v) => {
			panel.edgeBundleStrength = v;
			cb.applyClusterForce();
			cb.restartSimulation(0.3);
			cb.markDirty();
		},
		t("desc.edgeBundleStrength"),
	);
}

/** Force simulation parameter sliders (center, repel, link force, link distance) */
export function buildForceParameters(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;

	let forceDebounce: ReturnType<typeof setTimeout> | undefined;
	const debouncedForceUpdate = () => {
		clearTimeout(forceDebounce);
		forceDebounce = setTimeout(() => {
			cb.updateForces();
			cb.restartSimulation(0.3);
		}, 150);
	};

	addSlider(
		body,
		t("force.centerForce"),
		0,
		0.15,
		0.005,
		panel.centerForce,
		(v) => {
			panel.centerForce = v;
			debouncedForceUpdate();
		},
		t("desc.centerForce"),
	);
	addSlider(
		body,
		t("force.repelForce"),
		0,
		500,
		10,
		panel.repelForce,
		(v) => {
			panel.repelForce = v;
			debouncedForceUpdate();
		},
		t("desc.repelForce"),
	);
	addSlider(
		body,
		t("force.linkForce"),
		0,
		0.1,
		0.005,
		panel.linkForce,
		(v) => {
			panel.linkForce = v;
			debouncedForceUpdate();
		},
		t("desc.linkForce"),
	);
	addSlider(
		body,
		t("force.linkDistance"),
		10,
		300,
		10,
		panel.linkDistance,
		(v) => {
			panel.linkDistance = v;
			debouncedForceUpdate();
		},
		t("desc.linkDistance"),
	);
	const rt = mergeRenderThresholds(panel.renderThresholds);
	addSlider(
		body,
		t("render.clusterChargeForce"),
		-50,
		0,
		1,
		rt.clusterChargeForce,
		(v) => {
			ensureRT(panel).clusterChargeForce = v;
			cb.doRenderKeepPanel();
		},
		t("render.clusterChargeForceDesc"),
	);
}

/** Cluster group rules sub-section (follow-mode info or independent rule editor) */
export function buildClusterGroupRules(s: ClusterSectionCtx): void {
	const { body, panel, ctx, cb } = s;

	const clusterHeader = body.createDiv({ cls: "setting-item" });
	clusterHeader.createDiv({ cls: "setting-item-name", text: t("cluster.groupRulesHeading") });

	if (panel.clusterFollowsGroupBy) {
		const infoEl = body.createDiv({ cls: "setting-item-description gi-follow-info" });
		infoEl.textContent = t("cluster.usingGroupBy");
	} else {
		const clusterListEl = body.createDiv({ cls: "gi-multirule-list" });
		renderClusterRuleList(clusterListEl, panel, ctx, cb);

		const addClusterBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGroupRule") });
		addClusterBtn.addEventListener("click", () => {
			panel.clusterGroupRules.push({ groupBy: "tag:?", recursive: false });
			renderClusterRuleList(clusterListEl, panel, ctx, cb);
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		});
	}
}

/** Directional gravity rules sub-section */
export function buildDirectionalGravityRules(s: ClusterSectionCtx): void {
	const { body, panel, ctx, cb } = s;

	const gravHeader = body.createDiv({ cls: "setting-item" });
	gravHeader.createDiv({ cls: "setting-item-name", text: t("cluster.gravityRulesHeading") });
	const gravListEl = body.createDiv({ cls: "gi-gravity-rule-list" });
	renderDirectionalGravityList(gravListEl, panel, ctx, cb);

	const addGravBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGravityRule") });
	addGravBtn.addEventListener("click", () => {
		panel.directionalGravityRules.push({ filter: "*", direction: "top", strength: 0.1 });
		renderDirectionalGravityList(gravListEl, panel, ctx, cb);
		cb.applyDirectionalGravityForce();
		cb.restartSimulation(0.3);
	});
}

/** Sort rules sub-section */
export function buildSortRules(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;

	const sortHeader = body.createDiv({ cls: "setting-item" });
	sortHeader.createDiv({ cls: "setting-item-name", text: t("cluster.sortHeading") });
	const sortListEl = body.createDiv({ cls: "gi-sort-list" });
	renderSortRuleList(sortListEl, panel, cb);

	const addSortBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addSortRule") });
	addSortBtn.addEventListener("click", () => {
		panel.sortRules.push({ key: "label", order: "asc" });
		renderSortRuleList(sortListEl, panel, cb);
		cb.applyClusterForce();
		cb.doRenderKeepPanel();
	});
}
