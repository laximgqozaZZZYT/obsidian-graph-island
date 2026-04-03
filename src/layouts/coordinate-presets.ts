import type { CoordinateLayout, ClusterArrangement, CurveKind } from "../types";
import {
	SOURCE_PROPERTY,
	SOURCE_RANDOM,
	SOURCE_INDEX,
	SOURCE_FIELD,
	SOURCE_METRIC,
	TRANSFORM_DATE_INDEX,
	TRANSFORM_EXPRESSION,
	TRANSFORM_EVEN_DIVIDE,
	TRANSFORM_LINEAR,
	TRANSFORM_STACK_AVOID,
	ARRANGEMENT_TIMELINE,
	ARRANGEMENT_RANDOM,
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_GRID,
	ARRANGEMENT_CUSTOM,
} from "../constants";

// ---------------------------------------------------------------------------
// Curve Registry — parametric curve presets for the "curve" transform
// ---------------------------------------------------------------------------

interface CurveDefinition {
	label: string;
	labelJa: string;
	/** Mathematical formula using param names as variables (e.g. "a + b*t") */
	formula: string;
	defaultParams: Record<string, number>;
	paramLabels: Record<string, string>;
	paramLabelsJa: Record<string, string>;
	/** Returns (r, θ) or (x, y) depending on usage. First element is the primary axis value. */
	fn: (t: number, params: Record<string, number>) => number;
}

export const CURVE_REGISTRY: Record<CurveKind, CurveDefinition> = {
	archimedean: {
		label: "Archimedean Spiral",
		labelJa: "アルキメデスの螺旋",
		formula: "a + b*t",
		defaultParams: { a: 0, b: 1 },
		paramLabels: { a: "Offset (a)", b: "Growth (b)" },
		paramLabelsJa: { a: "オフセット (a)", b: "成長率 (b)" },
		fn: (t, p) => (p.a ?? 0) + (p.b ?? 1) * t,
	},
	logarithmic: {
		label: "Logarithmic Spiral",
		labelJa: "対数螺旋",
		formula: "a*exp(b*t*tau)",
		defaultParams: { a: 1, b: 0.3 },
		paramLabels: { a: "Scale (a)", b: "Growth (b)" },
		paramLabelsJa: { a: "スケール (a)", b: "成長率 (b)" },
		fn: (t, p) => (p.a ?? 1) * Math.exp((p.b ?? 0.3) * t * Math.PI * 2),
	},
	fermat: {
		label: "Fermat Spiral",
		labelJa: "フェルマーの螺旋",
		formula: "a*sqrt(t)",
		defaultParams: { a: 1 },
		paramLabels: { a: "Scale (a)" },
		paramLabelsJa: { a: "スケール (a)" },
		fn: (t, p) => (p.a ?? 1) * Math.sqrt(t),
	},
	hyperbolic: {
		label: "Hyperbolic Spiral",
		labelJa: "双曲螺旋",
		formula: "a/t",
		defaultParams: { a: 1 },
		paramLabels: { a: "Scale (a)" },
		paramLabelsJa: { a: "スケール (a)" },
		fn: (t, p) => (t > 0 ? (p.a ?? 1) / t : (p.a ?? 1) * 10),
	},
	cardioid: {
		label: "Cardioid",
		labelJa: "カージオイド",
		formula: "a*(1 + cos(t*tau))",
		defaultParams: { a: 1 },
		paramLabels: { a: "Scale (a)" },
		paramLabelsJa: { a: "スケール (a)" },
		fn: (t, p) => (p.a ?? 1) * (1 + Math.cos(t * Math.PI * 2)),
	},
	rose: {
		label: "Rose Curve",
		labelJa: "バラ曲線",
		formula: "a*cos(k*t*tau)",
		defaultParams: { k: 3, a: 1 },
		paramLabels: { k: "Petals (k)", a: "Scale (a)" },
		paramLabelsJa: { k: "花弁数 (k)", a: "スケール (a)" },
		fn: (t, p) => (p.a ?? 1) * Math.cos((p.k ?? 3) * t * Math.PI * 2),
	},
	lissajous: {
		label: "Lissajous",
		labelJa: "リサージュ",
		formula: "sin(a*t*tau + delta)",
		defaultParams: { a: 3, b: 2, delta: 0.5 },
		paramLabels: { a: "Freq X (a)", b: "Freq Y (b)", delta: "Phase (δ)" },
		paramLabelsJa: { a: "X周波数 (a)", b: "Y周波数 (b)", delta: "位相差 (δ)" },
		fn: (t, p) => Math.sin((p.a ?? 3) * t * Math.PI * 2 + (p.delta ?? 0.5)),
	},
	golden: {
		label: "Golden Spiral",
		labelJa: "黄金螺旋",
		formula: "a*1.618^(t*4)",
		defaultParams: { a: 1 },
		paramLabels: { a: "Scale (a)" },
		paramLabelsJa: { a: "スケール (a)" },
		fn: (t, p) => (p.a ?? 1) * Math.pow(1.6180339887, t * 4),
	},
};

/**
 * Maps each legacy arrangement name to its equivalent CoordinateLayout.
 * These serve as presets — selecting an arrangement fills in the coordinate config.
 * The coordinate system is NOT coupled to the arrangement; users can override freely.
 */
export const ARRANGEMENT_PRESETS: Record<ClusterArrangement, CoordinateLayout> = {
	// "inherit" resolves at runtime in LayoutController — placeholder only.
	// Uses a distinct marker so resolveArrangementFromLayout doesn't confuse it with "grid".
	inherit: {
		system: "cartesian",
		axis1: { source: { kind: SOURCE_INDEX }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		axis2: { source: { kind: SOURCE_INDEX }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		perGroup: true,
	},
	concentric: {
		system: "polar",
		axis1: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "floor(i / _ringSize) + 1", scale: 1 },
		},
		axis2: { source: { kind: SOURCE_INDEX }, transform: { kind: TRANSFORM_EVEN_DIVIDE, totalRange: 360 } },
		perGroup: false,
		constants: { _ringSize: 12 },
	},
	radial: {
		system: "polar",
		axis1: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "floor(i / _spokeCount) + 1", scale: 1 },
		},
		axis2: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "(i % _spokeCount) * (360 / _spokeCount)", scale: 1 },
		},
		perGroup: true,
		constants: { _spokeCount: 8 },
	},
	phyllotaxis: {
		system: "polar",
		axis1: { source: { kind: SOURCE_INDEX }, transform: { kind: TRANSFORM_EXPRESSION, expr: "sqrt(i)", scale: 1 } },
		axis2: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "i * pi * (3 - sqrt(5))", scale: 1 },
		},
		perGroup: true,
	},
	grid: {
		system: "cartesian",
		axis1: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "i % ceil(sqrt(n))", scale: 1 },
		},
		axis2: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "floor(i / ceil(sqrt(n)))", scale: 1 },
		},
		perGroup: true,
	},
	triangle: {
		system: "cartesian",
		axis1: {
			source: { kind: SOURCE_INDEX },
			transform: {
				kind: TRANSFORM_EXPRESSION,
				expr: "i - floor((-1+sqrt(1+8*i))/2)*(floor((-1+sqrt(1+8*i))/2)+1)/2 - floor((-1+sqrt(1+8*i))/2)/2",
				scale: 1,
			},
		},
		axis2: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "floor((-1+sqrt(1+8*i))/2)", scale: 1 },
		},
		perGroup: true,
	},
	random: {
		system: "cartesian",
		axis1: { source: { kind: SOURCE_RANDOM, seed: 42 }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		axis2: { source: { kind: SOURCE_RANDOM, seed: 42 }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		perGroup: true,
	},
	timeline: {
		system: "cartesian",
		axis1: { source: { kind: SOURCE_PROPERTY, key: "date" }, transform: { kind: TRANSFORM_DATE_INDEX } },
		axis2: { source: { kind: SOURCE_INDEX }, transform: { kind: TRANSFORM_STACK_AVOID } },
		perGroup: true,
	},
	custom: {
		system: "cartesian",
		axis1: { source: { kind: SOURCE_FIELD, field: "folder" }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		axis2: { source: { kind: SOURCE_METRIC, metric: "degree" }, transform: { kind: TRANSFORM_LINEAR, scale: 1 } },
		perGroup: true,
	},
	ego: {
		system: "polar",
		axis1: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "floor(i / _spokeCount) + 1", scale: 1 },
		},
		axis2: {
			source: { kind: SOURCE_INDEX },
			transform: { kind: TRANSFORM_EXPRESSION, expr: "(i % _spokeCount) * (360 / _spokeCount)", scale: 1 },
		},
		perGroup: true,
		constants: { _spokeCount: 8 },
	},
};

/**
 * Resolve the effective CoordinateLayout for the current panel state.
 * If coordinateLayout is explicitly set, use it.
 * Otherwise, derive from clusterArrangement preset.
 */
export function resolveCoordinateLayout(
	arrangement: ClusterArrangement,
	override: CoordinateLayout | null,
): CoordinateLayout {
	return override ?? ARRANGEMENT_PRESETS[arrangement];
}

/**
 * Determine which arrangement function to call based on CoordinateLayout.
 * This maps coordinate configs back to the concrete offset function.
 *
 * The mapping uses the SOURCE types of each axis to infer the right algorithm,
 * NOT the coordinate system. This ensures polar can be used with timeline, etc.
 */
export function resolveArrangementFromLayout(layout: CoordinateLayout): ClusterArrangement {
	// Fast path: exact preset match
	const exact = findMatchingPreset(layout);
	if (exact !== ARRANGEMENT_CUSTOM) return exact;

	const s1 = layout.axis1.source.kind;
	const s2 = layout.axis2.source.kind;
	const t1 = layout.axis1.transform.kind;
	const t2 = layout.axis2.transform.kind;

	// Property + date-to-index on axis1 → timeline
	if (s1 === SOURCE_PROPERTY && t1 === TRANSFORM_DATE_INDEX) return ARRANGEMENT_TIMELINE;

	// Random sources → random
	if (s1 === SOURCE_RANDOM || s2 === SOURCE_RANDOM) return ARRANGEMENT_RANDOM;

	// Index on axis1 with expression + even-divide on axis2 + perGroup=false → concentric
	if (s1 === SOURCE_INDEX && t1 === TRANSFORM_EXPRESSION && t2 === TRANSFORM_EVEN_DIVIDE && !layout.perGroup)
		return ARRANGEMENT_CONCENTRIC;

	// Index + index with specific transforms
	if (s1 === SOURCE_INDEX && s2 === SOURCE_INDEX) return ARRANGEMENT_GRID;

	return ARRANGEMENT_GRID; // fallback
}

// ---------------------------------------------------------------------------
// Preset detection
// ---------------------------------------------------------------------------

/** Pre-computed JSON strings for all presets (for fast membership check) */
const PRESET_JSON_SET: Set<string> = new Set(Object.values(ARRANGEMENT_PRESETS).map((p) => JSON.stringify(p)));

/**
 * Check if a CoordinateLayout exactly matches any built-in preset.
 * Returns true if the layout is a known preset, false for custom configs.
 *
 * Note: does NOT return the preset name because some presets share identical
 * coordinate configs (e.g. grid and triangle). Use resolveArrangementFromLayout()
 * to determine which hardcoded function to dispatch to.
 */
export function isExactPreset(layout: CoordinateLayout): boolean {
	return PRESET_JSON_SET.has(JSON.stringify(layout));
}

/**
 * Find which arrangement preset matches the given layout, if any.
 * Returns the arrangement name, or "custom" if no preset matches.
 * When multiple presets share the same layout (e.g. grid/triangle),
 * the first match wins (iteration order of ARRANGEMENT_PRESETS).
 */
export function findMatchingPreset(layout: CoordinateLayout): ClusterArrangement {
	const json = JSON.stringify(layout);
	for (const [name, preset] of Object.entries(ARRANGEMENT_PRESETS)) {
		if (name === ARRANGEMENT_CUSTOM) continue;
		if (JSON.stringify(preset) === json) return name as ClusterArrangement;
	}
	return ARRANGEMENT_CUSTOM;
}
