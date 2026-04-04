// ---------------------------------------------------------------------------
// Layout & Settings tab section builders — extracted from PanelBuilder.ts
// ---------------------------------------------------------------------------
import type {
  AxisConfig, ClusterArrangement, ClusterGroupArrangement,
  CoordinateLayout, CoordinateSystem,
} from "../types";
import { mergeRenderThresholds, ontologyToRules, rulesToOntologyFields } from "../types";
import { t, tHelp } from "../i18n";
import {
  TAG_DISPLAY_ENCLOSURE,
  ARRANGEMENT_CONCENTRIC, ARRANGEMENT_TIMELINE,
  SOURCE_PROPERTY, TRANSFORM_EVEN_DIVIDE,
} from "../constants";
import { ARRANGEMENT_PRESETS, findMatchingPreset } from "../layouts/coordinate-presets";
import { importPreset, applyPreset, type PresetMigrationInfo } from "../utils/presets";
import { showToast } from "../utils/toast";
import {
  buildDualRangeSlider, addSlider, addToggle, addSelect,
  attachDatalist, renderClusterRuleList, renderDirectionalGravityList,
  renderSortRuleList, renderOntologyRule, renderCustomMappings,
  renderTagRelations,
} from "./panel-widgets";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { ensureRT, buildSection } from "./PanelBuilder";

// Re-export for internal consumption by PanelBuilder call sites
export { syncArrangementFromLayout, getPreset };

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

// ---------------------------------------------------------------------------
// Settings tab section builders
// ---------------------------------------------------------------------------

export function buildGraphSyncSection(
  tabEl: HTMLElement, panel: PanelState, _ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.graphSync"), (body) => {
    addToggle(body, t("display.syncWithEditor"), panel.syncWithEditor, (v) => {
      panel.syncWithEditor = v;
      cb.markDirty(); // Persist setting
    }, t("desc.syncWithEditor"));
    // ビュー同期トグル: 他の Graph Island ビューとパネル状態を同期
    addToggle(body, t("display.syncView"), panel.syncViewId !== null, (v) => {
      panel.syncViewId = v ? crypto.randomUUID() : null;
      cb.markDirty();
    }, t("desc.syncView"));
    addSlider(body, t("display.localGraphHops"), 1, 5, 1, panel.localGraphHops, (v) => {
      panel.localGraphHops = v;
      if (panel.localGraphCenter) cb.doRenderKeepPanel();
      else cb.markDirty(); // Persist even when not in local graph mode
    }, t("desc.localGraphHops"));
  }, tHelp("help.graphSync"), false, "settings");
}

export function buildPluginSettingsSection(
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.pluginSettings"), (body) => {
    const s = ctx.settings;

    // metadataFields removed — not consumed by any parser; edge fields come from ontology rules
    if (panel.showTagNodes && panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
      addSlider(body, t("settings.enclosureMinRatio"), 0, 0.3, 0.02, s.enclosureMinRatio, (v) => {
        s.enclosureMinRatio = v;
        ctx.saveSettings();
        cb.markDirty();
      }, t("desc.enclosureMinRatio"));
      // FY: Enclosure fill opacity override
      const rtEnc = mergeRenderThresholds(panel.renderThresholds);
      addSlider(body, t("display.enclosureFillOpacity") ?? "Enclosure Fill", 0, 1, 0.05, rtEnc.enclosureFillOpacity, (v) => {
        ensureRT(panel).enclosureFillOpacity = v;
        cb.markDirty();
      });
      // GC: Enclosure stroke width override
      addSlider(body, t("display.enclosureStrokeWidth") ?? "Enclosure Stroke", 0, 10, 0.5, rtEnc.enclosureStrokeWidth, (v) => {
        ensureRT(panel).enclosureStrokeWidth = v;
        cb.markDirty();
      });
      // FU: Enclosure label position
      addSelect(body, t("display.enclosureLabelPos") ?? "Label Position", [
        { value: "top", label: t("display.enclosureLabelPos.top") ?? "Top" },
        { value: "center", label: t("display.enclosureLabelPos.center") ?? "Center" },
        { value: "bottom", label: t("display.enclosureLabelPos.bottom") ?? "Bottom" },
      ], rtEnc.enclosureLabelPosition, (v) => {
        ensureRT(panel).enclosureLabelPosition = v as "top" | "center" | "bottom";
        cb.markDirty();
      });
    }
  }, tHelp("help.pluginSettings"), false, "settings");
}

export function buildOntologySection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.ontology"), (body) => {
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
      const addBtn = listEl.createEl("button", { cls: "gi-ont-add-btn", text: `+ ${t("settings.ontAddRule")}` });
      addBtn.addEventListener("click", () => {
        rules.push({ forward: "", relation: "is-a", reverse: "" });
        save();
        renderRules();
      });
    }
    renderRules();

    addToggle(body, t("settings.tagHierarchy"), s.ontology.useTagHierarchy, (v) => {
      s.ontology.useTagHierarchy = v;
      ctx.saveSettings(); cb.invalidateDataKeepPanel();
    }, t("desc.tagHierarchy"));
  }, tHelp("help.ontology"), false, "network");
}

export function buildCustomMappingsSection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.customMappings"), (body) => {
    const mappingsListEl = body.createDiv({ cls: "gi-mappings-list" });
    renderCustomMappings(mappingsListEl, ctx.settings, ctx, cb);
  }, tHelp("help.customMappings"), true, "map");
}

export function buildTagRelationsSection(
  tabEl: HTMLElement, _panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
): void {
  buildSection(tabEl, t("section.tagRelations"), (body) => {
    const tagRelListEl = body.createDiv({ cls: "gi-tag-relations-list" });
    renderTagRelations(tagRelListEl, ctx.settings, ctx, cb);
  }, tHelp("help.tagRelations"), true, "tag");
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
  tabEl: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks,
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
      const app = ctx.app as any;
      const pluginDir = ctx.pluginDir ?? ".obsidian/plugins/graph-island";
      const filePath = `${pluginDir}/samples/${name}.json`;
      const json = await app.vault.adapter.read(filePath);
      const info: PresetMigrationInfo = { migratedFields: [], removedFields: [] };
      const preset = importPreset(json, info);
      const merged = applyPreset(panel, preset);
      Object.assign(panel, merged);
      cb.invalidateData();
      if (panel.presetZoomLevel > 0) {
        setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
      }
      cb.rebuildPanel();
      showToast(t("preset.sampleLoaded").replace("{name}", name));
    } catch {
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
  addSelect(s.body, t("cluster.pattern"), [
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
  ], s.panel.clusterArrangement, (v) => {
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
  }, t("desc.clusterPattern"));
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
    if (v) s.cb.startOrbitAnimation(); else s.cb.stopOrbitAnimation();
  });
}

/** Coordinate system, axis inputs, preview, expression library, constants, perGroup, polar range */
export function buildCoordinateControls(
  s: ClusterSectionCtx,
  buildAxisTextInput: (body: HTMLElement, label: string, axis: AxisConfig, idx: 1 | 2, panel: PanelState, cb: PanelCallbacks, ctx: PanelContext, suggestions: string[]) => void,
  buildCoordPreview: (body: HTMLElement, layout: CoordinateLayout) => void,
  buildExprLibrary: (body: HTMLElement, panel: PanelState, cb: PanelCallbacks) => void,
  buildConstantsUI: (body: HTMLElement, panel: PanelState, cb: PanelCallbacks) => void,
  getAxisSourceSuggestions: (ctx: PanelContext) => string[],
): void {
  const { body, panel, cb, ctx } = s;
  const coordLayout = panel.coordinateLayout
    ?? getPreset(panel.clusterArrangement);

  addSelect(body, t("coord.system"), [
    { value: "cartesian", label: t("coord.cartesian") },
    { value: "polar", label: t("coord.polar") },
  ], coordLayout.system, (v) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    panel.coordinateLayout = { ...base, system: v as CoordinateSystem };
    syncArrangementFromLayout(panel);
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
  }, t("desc.coordSystem"));

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

  addToggle(body, t("coord.perGroup"), coordLayout.perGroup, (v) => {
    const base = panel.coordinateLayout
      ?? { ...getPreset(panel.clusterArrangement) };
    panel.coordinateLayout = { ...base, perGroup: v };
    syncArrangementFromLayout(panel);
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
  }, t("desc.perGroup"));

  if (coordLayout.system === "polar" && coordLayout.axis2.transform.kind === TRANSFORM_EVEN_DIVIDE) {
    addSlider(body, `${axis2Label} ${t("coord.range")} (°)`, 30, 360, 10,
      coordLayout.axis2.transform.totalRange, (v) => {
      const base = panel.coordinateLayout
        ?? { ...getPreset(panel.clusterArrangement) };
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
    }, "Angle range for polar arrangement");
  }
}

/** Timeline-specific controls: time key, end key, duration bars, routes, tick labels, order fields, range */
export function buildTimelineControls(s: ClusterSectionCtx): void {
  const { body, panel, cb, ctx } = s;
  const effectiveLayout = panel.coordinateLayout ?? getPreset(panel.clusterArrangement);
  if (!effectiveLayout) return;
  const hasPropertyAxis = effectiveLayout.axis1.source.kind === SOURCE_PROPERTY
    || effectiveLayout.axis2.source.kind === SOURCE_PROPERTY;
  if (panel.clusterArrangement !== ARRANGEMENT_TIMELINE && !hasPropertyAxis) return;

  const row = body.createDiv({ cls: "gi-setting-row" });
  row.createEl("span", { cls: "gi-setting-label", text: t("timeline.timeKey") });
  const input = row.createEl("input", { cls: "gi-setting-input", type: "text" });
  input.value = panel.timelineKey;
  input.placeholder = "date";
  input.setAttribute("aria-label", t("timeline.timeKeyHint"));
  attachDatalist(input, ctx.frontmatterKeys);
  input.addEventListener("change", () => {
    panel.timelineKey = input.value.trim() || "date";
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });
  body.createEl("p", { cls: "gi-hint", text: t("timeline.timeKeyHint") });

  // Timeline end key input (for duration bars)
  const endRow = body.createDiv({ cls: "gi-setting-row" });
  endRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.endKey") });
  const endInput = endRow.createEl("input", { cls: "gi-setting-input", type: "text" });
  endInput.value = panel.timelineEndKey;
  endInput.placeholder = "end-date";
  endInput.setAttribute("aria-label", t("timeline.endKeyHint"));
  attachDatalist(endInput, ctx.frontmatterKeys);
  endInput.addEventListener("change", () => {
    panel.timelineEndKey = endInput.value.trim() || "end-date";
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });

  // Duration bars toggle
  addToggle(body, t("timeline.showDurationBars"), panel.showDurationBars, (v) => {
    panel.showDurationBars = v;
    cb.markDirty();
  });

  // Timeline route lines toggle
  addToggle(body, t("timeline.showRoutes"), panel.showTimelineRoutes, (v) => {
    panel.showTimelineRoutes = v;
    cb.markDirty();
  });

  // Timeline tick labels toggle
  addToggle(body, t("timeline.showTickLabels"), panel.showTimelineTickLabels, (v) => {
    panel.showTimelineTickLabels = v;
    cb.markDirty();
  }, t("timeline.showTickLabelsDesc"));

  // Timeline order fields
  const orderRow = body.createDiv({ cls: "gi-setting-row" });
  orderRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.orderFields") });
  const orderInput = orderRow.createEl("input", { cls: "gi-setting-input", type: "text" });
  orderInput.value = panel.timelineOrderFields;
  orderInput.placeholder = "parent_id,story_order";
  orderInput.setAttribute("aria-label", t("timeline.orderFieldsHint"));
  orderInput.addEventListener("change", () => {
    panel.timelineOrderFields = orderInput.value.trim();
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
  });
  body.createEl("p", { cls: "gi-hint", text: t("timeline.orderFieldsHint") });

  // Timeline range dual slider
  buildDualRangeSlider(body, t("timeline.range") || "Time range",
    panel.timelineRangeMin, panel.timelineRangeMax,
    (min, max) => {
      panel.timelineRangeMin = min;
      panel.timelineRangeMax = max;
      cb.doRenderKeepPanel();
    }, t("desc.timelineRange") || "Visible time range (% of total)");
}

/** Auto-fit toggle, guide lines, group grid, and custom grid settings */
export function buildAutoFitAndGuides(s: ClusterSectionCtx): void {
  const { body, panel, cb } = s;

  // Auto-fit toggle — disables manual spacing sliders when ON
  const setSliderDisabled = (disabled: boolean) => {
    for (const el of s.spacingSliders) {
      el.style.opacity = disabled ? "0.5" : "";
      el.style.pointerEvents = disabled ? "none" : "";
    }
  };
  addToggle(body, t("cluster.autoFit"), panel.autoFit, (v) => {
    panel.autoFit = v;
    // HC: Reset preset zoom when enabling auto-fit (prevents race condition)
    if (v) panel.presetZoomLevel = 0;
    setSliderDisabled(v);
    cb.applyClusterForce();
    cb.restartSimulation(0.5);
    cb.doRenderKeepPanel();
  }, t("desc.autoFit"));

  // --- Grid & Guide section ---
  addToggle(body, t("display.dotGrid"), panel.showDotGrid, (v) => { panel.showDotGrid = v; cb.markDirty(); }, t("desc.dotGrid"));

  // Custom grid settings (visible when coordinate layout is active)
  if (panel.coordinateLayout) {
    const hasGrid = !!panel.coordinateLayout.grid;
    addToggle(body, t("guide.gridTableMode"), hasGrid, (v) => {
      if (v && panel.coordinateLayout) {
        panel.coordinateLayout.grid = {
          style: panel.gridStyle,
          cellShading: panel.gridCellShading,
        };
      } else if (panel.coordinateLayout) {
        panel.coordinateLayout.grid = undefined;
      }
      cb.applyClusterForce();
      cb.restartSimulation(0.3);
      cb.rebuildPanel();
    }, t("guide.gridTableModeDesc"));

    if (hasGrid) {
      addSelect(body, t("guide.gridStyle"), [
        { value: "lines", label: t("guide.gridStyle.lines") },
        { value: "table", label: t("guide.gridStyle.table") },
      ], panel.gridStyle, (v) => {
        panel.gridStyle = v as "lines" | "table";
        if (panel.coordinateLayout?.grid) {
          panel.coordinateLayout.grid.style = panel.gridStyle;
        }
        cb.applyClusterForce();
        cb.restartSimulation(0.3);
        cb.doRenderKeepPanel();
      });

      addToggle(body, t("guide.gridShowHeaders"), panel.gridShowHeaders, (v) => {
        panel.gridShowHeaders = v;
        cb.markDirty();
      }, t("guide.gridShowHeadersDesc"));

      addSelect(body, t("guide.labelPlacement"), [
        { value: "on-line", label: t("guide.labelOnLine") },
        { value: "between", label: t("guide.labelBetween") },
      ], panel.gridLabelPlacement, (v) => {
        panel.gridLabelPlacement = v as "on-line" | "between";
        cb.markDirty();
      });

      addToggle(body, t("guide.gridCellShading"), panel.gridCellShading, (v) => {
        panel.gridCellShading = v;
        if (panel.coordinateLayout?.grid) {
          panel.coordinateLayout.grid.cellShading = v;
        }
        cb.applyClusterForce();
        cb.restartSimulation(0.3);
        cb.doRenderKeepPanel();
      }, t("guide.gridCellShadingDesc"));
    }
  }

  // Axis titles — only relevant when coordinate guides or timeline produce axis labels
  if (panel.coordinateLayout || panel.clusterArrangement === ARRANGEMENT_TIMELINE) {
    addToggle(body, t("guide.showAxisTitles"), panel.showAxisTitles, (v) => {
      panel.showAxisTitles = v;
      cb.markDirty();
    }, t("guide.showAxisTitlesDesc"));
  }
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

  s.spacingSliders.push(addSlider(body, t("cluster.nodeSpacing"), 1, 10, 0.5, panel.clusterNodeSpacing, (v) => {
    panel.clusterNodeSpacing = v;
    debouncedClusterForce();
  }, t("desc.nodeSpacing")));

  // Inter-group arrangement dropdown
  addSelect(body, t("cluster.groupArrangement"), [
    { value: "auto", label: t("cluster.groupArrangementAuto") },
    { value: "circle", label: t("cluster.groupArrangementCircle") },
    { value: "horizontal", label: t("cluster.groupArrangementHorizontal") },
    { value: "vertical", label: t("cluster.groupArrangementVertical") },
    { value: "concentric", label: t("cluster.groupArrangementConcentric") },
    { value: "grid", label: t("cluster.groupArrangementGrid") },
  ], panel.clusterGroupArrangement, (v) => {
    panel.clusterGroupArrangement = v as ClusterGroupArrangement;
    cb.applyClusterForce();
    cb.restartSimulation(1.0);
  }, t("desc.groupArrangement"));

  s.spacingSliders.push(addSlider(body, t("cluster.groupSize"), 0.5, 5, 0.25, panel.clusterGroupScale, (v) => {
    panel.clusterGroupScale = v;
    debouncedClusterForce();
  }, t("desc.groupSize")));
  s.spacingSliders.push(addSlider(body, t("cluster.groupSpacing"), 0.5, 5, 0.25, panel.clusterGroupSpacing, (v) => {
    panel.clusterGroupSpacing = v;
    debouncedClusterForce();
  }, t("desc.groupSpacing")));

  // Apply initial disabled state for autoFit
  for (const el of s.spacingSliders) {
    el.style.opacity = panel.autoFit ? "0.5" : "";
    el.style.pointerEvents = panel.autoFit ? "none" : "";
  }

  // Cluster gravity sliders (only when groupBy is active)
  if (panel.groupBy && panel.groupBy !== "none") {
    if (!panel.clusterGravity) {
      panel.clusterGravity = { interGroupAttraction: 0.5, intraGroupDensity: 1.0 };
    }
    addSlider(body, t("gravity.interGroupAttraction"), 0, 2, 0.1, panel.clusterGravity.interGroupAttraction, (v) => {
      panel.clusterGravity.interGroupAttraction = v;
      debouncedClusterForce();
    }, t("gravity.interGroupAttractionDesc"));
    addSlider(body, t("gravity.intraGroupDensity"), 0.1, 3, 0.1, panel.clusterGravity.intraGroupDensity, (v) => {
      panel.clusterGravity.intraGroupDensity = v;
      debouncedClusterForce();
    }, t("gravity.intraGroupDensityDesc"));
  }

  addSlider(body, t("cluster.edgeBundleStrength"), 0, 1, 0.05, panel.edgeBundleStrength, (v) => {
    panel.edgeBundleStrength = v;
    cb.applyClusterForce();
    cb.restartSimulation(0.3);
    cb.markDirty();
  }, t("desc.edgeBundleStrength"));
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

  addSlider(body, t("force.centerForce"), 0, 0.15, 0.005, panel.centerForce, (v) => {
    panel.centerForce = v;
    debouncedForceUpdate();
  }, t("desc.centerForce"));
  addSlider(body, t("force.repelForce"), 0, 500, 10, panel.repelForce, (v) => {
    panel.repelForce = v;
    debouncedForceUpdate();
  }, t("desc.repelForce"));
  addSlider(body, t("force.linkForce"), 0, 0.1, 0.005, panel.linkForce, (v) => {
    panel.linkForce = v;
    debouncedForceUpdate();
  }, t("desc.linkForce"));
  addSlider(body, t("force.linkDistance"), 10, 300, 10, panel.linkDistance, (v) => {
    panel.linkDistance = v;
    debouncedForceUpdate();
  }, t("desc.linkDistance"));
  const rt = mergeRenderThresholds(panel.renderThresholds);
  addSlider(body, t("render.clusterChargeForce"), -50, 0, 1,
    rt.clusterChargeForce, (v) => {
      ensureRT(panel).clusterChargeForce = v;
      cb.doRenderKeepPanel();
    }, t("render.clusterChargeForceDesc"));
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
