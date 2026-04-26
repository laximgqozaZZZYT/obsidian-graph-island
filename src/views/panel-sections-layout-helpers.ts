// ---------------------------------------------------------------------------
// Panel section helpers — extracted from panel-sections-layout.ts to keep
// buildAutoFitAndGuides and buildSpacingAndGroupArrangement under the
// 120-line per-function ceiling enforced by the autonomous gate.
// ---------------------------------------------------------------------------
import { t } from "../i18n";
import { ARRANGEMENT_TIMELINE } from "../constants";
import { addSlider, addSelect, addToggle } from "./panel-widgets";
import type { ClusterSectionCtx } from "./panel-sections-layout";

/** Auto-fit toggle that also greys-out the manual spacing sliders when ON. */
export function addAutoFitToggle(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;

	const setSliderDisabled = (disabled: boolean) => {
		for (const el of s.spacingSliders) {
			el.style.opacity = disabled ? "0.5" : "";
			el.style.pointerEvents = disabled ? "none" : "";
		}
	};

	addToggle(
		body,
		t("cluster.autoFit"),
		panel.autoFit,
		(v) => {
			panel.autoFit = v;
			// Reset preset zoom when enabling auto-fit (prevents race condition).
			if (v) panel.presetZoomLevel = 0;
			setSliderDisabled(v);
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
			cb.doRenderKeepPanel();
		},
		t("desc.autoFit"),
	);
}

/**
 * Custom grid controls (headers/label-placement/cell-shading).
 * Visible only when a coordinateLayout is active. No-op otherwise.
 */
export function addCustomGridControls(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;
	if (!panel.coordinateLayout) return;

	addToggle(
		body,
		t("guide.gridShowHeaders"),
		panel.gridShowHeaders,
		(v) => {
			panel.gridShowHeaders = v;
			cb.markDirty();
		},
		t("guide.gridShowHeadersDesc"),
	);

	addSelect(
		body,
		t("guide.labelPlacement"),
		[
			{ value: "on-line", label: t("guide.labelOnLine") },
			{ value: "between", label: t("guide.labelBetween") },
		],
		panel.gridLabelPlacement,
		(v) => {
			panel.gridLabelPlacement = v as "on-line" | "between";
			cb.markDirty();
		},
	);

	addToggle(
		body,
		t("guide.gridCellShading"),
		panel.gridCellShading,
		(v) => {
			panel.gridCellShading = v;
			if (panel.coordinateLayout?.grid) {
				panel.coordinateLayout.grid.cellShading = v;
			}
			cb.applyClusterForce();
			cb.restartSimulation(0.3);
			cb.doRenderKeepPanel();
		},
		t("guide.gridCellShadingDesc"),
	);
}

/** Axis-title toggle, only when coordinate guides or timeline produce axis labels. */
export function addAxisTitlesToggle(s: ClusterSectionCtx): void {
	const { body, panel, cb } = s;
	if (!panel.coordinateLayout && panel.clusterArrangement !== ARRANGEMENT_TIMELINE) return;

	addToggle(
		body,
		t("guide.showAxisTitles"),
		panel.showAxisTitles,
		(v) => {
			panel.showAxisTitles = v;
			cb.markDirty();
		},
		t("guide.showAxisTitlesDesc"),
	);
}

/** Cluster gravity sliders (inter/intra-group). Visible only when groupBy is active. */
export function addClusterGravitySliders(s: ClusterSectionCtx, debouncedClusterForce: () => void): void {
	const { body, panel } = s;
	if (!panel.groupBy || panel.groupBy === "none") return;

	if (!panel.clusterGravity) {
		panel.clusterGravity = { interGroupAttraction: 0.5, intraGroupDensity: 1.0 };
	}
	addSlider(
		body,
		t("gravity.interGroupAttraction"),
		0,
		2,
		0.1,
		panel.clusterGravity.interGroupAttraction,
		(v) => {
			panel.clusterGravity.interGroupAttraction = v;
			debouncedClusterForce();
		},
		t("gravity.interGroupAttractionDesc"),
	);
	addSlider(
		body,
		t("gravity.intraGroupDensity"),
		0.1,
		3,
		0.1,
		panel.clusterGravity.intraGroupDensity,
		(v) => {
			panel.clusterGravity.intraGroupDensity = v;
			debouncedClusterForce();
		},
		t("gravity.intraGroupDensityDesc"),
	);
}
