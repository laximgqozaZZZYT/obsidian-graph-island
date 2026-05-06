/**
 * panel-validate.ts
 *
 * Pure validation/sanitization for PanelState, extracted from
 * PanelBuilder.validatePanelState() to reduce god-object line count
 * and ESLint complexity (was 20).
 *
 * Each validator is a small, focused helper that mutates the panel
 * in place. Composition keeps complexity per function low while
 * preserving the original behaviour exactly.
 */
import type { PanelState } from "./PanelBuilder";
import { createDefaultPanelState } from "./panel-defaults";

const NUMERIC_KEYS: (keyof PanelState)[] = [
	"nodeSize",
	"centerForce",
	"repelForce",
	"linkForce",
	"linkDistance",
	"textFadeThreshold",
	"concentricMinRadius",
	"concentricRadiusStep",
	"hoverHops",
	"enclosureSpacing",
	"edgeBundleStrength",
	"clusterNodeSpacing",
	"clusterGroupScale",
	"clusterGroupSpacing",
];

const VALID_VIEW_MODES: ReadonlySet<string> = new Set(["graph", "sunburst", "timeline", "matrix"]);

const VALID_ARRANGEMENTS: ReadonlySet<string> = new Set([
	"inherit",
	"concentric",
	"radial",
	"phyllotaxis",
	"grid",
	"triangle",
	"random",
	"timeline",
	"custom",
	"ego",
]);

/** Replace NaN/Infinity in numeric fields with their defaults. */
function fixNumericFields(panel: PanelState, defaults: PanelState): void {
	for (const key of NUMERIC_KEYS) {
		const val = panel[key] as number;
		if (typeof val !== "number" || !isFinite(val)) {
			(panel as unknown as Record<string, unknown>)[key] = (defaults as unknown as Record<string, unknown>)[key];
		}
	}
}

/** Reset enum fields to a safe value when out of allowed set. */
function fixEnumFields(panel: PanelState): void {
	if (!VALID_VIEW_MODES.has(panel.viewMode)) panel.viewMode = "graph";
	if (!VALID_ARRANGEMENTS.has(panel.clusterArrangement)) panel.clusterArrangement = "inherit";
}

function clampInPlace(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** Clamp numeric fields to allowed ranges. */
function clampRanges(panel: PanelState): void {
	panel.hoverHops = clampInPlace(panel.hoverHops, 0, 10);
	panel.nodeSize = clampInPlace(panel.nodeSize, 1, 100);
}

/** Ensure array/set fields are the correct container type. */
function fixContainers(panel: PanelState): void {
	if (!Array.isArray(panel.multiSelectNodeIds)) panel.multiSelectNodeIds = [];
	if (!Array.isArray(panel.subgraphNodeIds)) panel.subgraphNodeIds = [];
	if (!Array.isArray(panel.subgraphStack)) panel.subgraphStack = [];
	if (!(panel.collapsedGroups instanceof Set)) {
		panel.collapsedGroups = new Set(Array.isArray(panel.collapsedGroups) ? panel.collapsedGroups : []);
	}
}

/** Apply settings migrations for older saved configs. */
function applyMigrations(panel: PanelState): void {
	if (panel.cableTrunkAlpha === 0) panel.cableTrunkAlpha = 0.25;
	const rt = panel.renderThresholds;
	if (!rt) return;
	if (rt.nodeSizeByDegree === false || rt.nodeSizeByDegree === undefined) {
		rt.nodeSizeByDegree = true;
	}
	if (rt.autoLOD === undefined) {
		rt.autoLOD = true;
	}
}

/** B2: Validate and sanitize panel state — fix NaN, undefined, out-of-range values. */
export function validatePanelState(panel: PanelState): void {
	const defaults = createDefaultPanelState() as PanelState;
	fixNumericFields(panel, defaults);
	fixEnumFields(panel);
	clampRanges(panel);
	fixContainers(panel);
	applyMigrations(panel);
}
