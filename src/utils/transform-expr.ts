// ---------------------------------------------------------------------------
// transform-expr.ts — Unified transform expression parser & serializer
// ---------------------------------------------------------------------------
// Syntax:  FUNC(source, param1, param2, ...)  or  just source (implicit linear)
//
// Examples:
//   tag:?              → source=field:tag, transform=linear(1)
//   COS(degree)        → source=metric:degree, transform=expression("cos(t)")
//   BIN(tag:?, 5)      → source=field:tag, transform=bin(5)
//   ROSE(index, k=5)   → source=index, transform=curve(rose, {k:5})
//   ARCHIMEDEAN(hop:name:3) → source=hop:name:3, transform=curve(archimedean)
//   sin(t*pi)*2        → raw expression (source unchanged), transform=expression(...)
// ---------------------------------------------------------------------------

import type { AxisSource, AxisTransform, CurveKind } from "../types";
import {
	TRANSFORM_EVEN_DIVIDE,
	TRANSFORM_EXPRESSION,
	TRANSFORM_LINEAR,
	TRANSFORM_BIN,
	TRANSFORM_DATE_INDEX,
	TRANSFORM_STACK_AVOID,
	TRANSFORM_GOLDEN,
	TRANSFORM_CURVE,
	TRANSFORM_SHAPE_FILL,
	SOURCE_PROPERTY,
	SOURCE_INDEX,
	SOURCE_FIELD,
	SOURCE_METRIC,
	SOURCE_HOP,
	SOURCE_RANDOM,
	SOURCE_CONST,
} from "../constants";
import { CURVE_REGISTRY } from "../layouts/coordinate-presets";

/** Result of parsing a transform expression */
interface TransformExprResult {
	source: AxisSource;
	transform: AxisTransform;
}

// ---------------------------------------------------------------------------
// Function name → transform mapping
// ---------------------------------------------------------------------------

type TransformFactory = (args: string[]) => AxisTransform;

/** Transform functions (case-insensitive lookup via uppercase keys) */
const TRANSFORM_FUNCTIONS: Record<string, TransformFactory> = {
	// --- Basic transforms ---
	LINEAR: (args) => ({ kind: TRANSFORM_LINEAR, scale: parseNumArg(args[0], 1) }),
	BIN: (args) => ({ kind: TRANSFORM_BIN, count: parseNumArg(args[0], 5) }),
	DATE_INDEX: () => ({ kind: TRANSFORM_DATE_INDEX }),
	STACK: () => ({ kind: TRANSFORM_STACK_AVOID }),
	GOLDEN: () => ({ kind: TRANSFORM_GOLDEN }),
	EVEN: (args) => ({ kind: TRANSFORM_EVEN_DIVIDE, totalRange: parseNumArg(args[0], 360) }),

	// --- Curve transforms ---
	ARCHIMEDEAN: (args) => makeCurveTransform("archimedean", args),
	LOG_SPIRAL: (args) => makeCurveTransform("logarithmic", args),
	LOGARITHMIC: (args) => makeCurveTransform("logarithmic", args),
	FERMAT: (args) => makeCurveTransform("fermat", args),
	HYPERBOLIC: (args) => makeCurveTransform("hyperbolic", args),
	CARDIOID: (args) => makeCurveTransform("cardioid", args),
	ROSE: (args) => makeCurveTransform("rose", args),
	LISSAJOUS: (args) => makeCurveTransform("lissajous", args),
	GOLDEN_SPIRAL: (args) => makeCurveTransform("golden", args),

	// --- Math functions → expression transforms ---
	SIN: () => ({ kind: TRANSFORM_EXPRESSION, expr: "sin(t * pi * 2)", scale: 1 }),
	COS: () => ({ kind: TRANSFORM_EXPRESSION, expr: "cos(t * pi * 2)", scale: 1 }),
	TAN: () => ({ kind: TRANSFORM_EXPRESSION, expr: "tan(t * pi)", scale: 1 }),
	SQRT: () => ({ kind: TRANSFORM_EXPRESSION, expr: "sqrt(t)", scale: 1 }),
	ABS: () => ({ kind: TRANSFORM_EXPRESSION, expr: "abs(t)", scale: 1 }),
	LOG: () => ({ kind: TRANSFORM_EXPRESSION, expr: "log(t + 0.01)", scale: 1 }),
	EXP: () => ({ kind: TRANSFORM_EXPRESSION, expr: "exp(t)", scale: 1 }),
	FLOOR: () => ({ kind: TRANSFORM_EXPRESSION, expr: "floor(t * 10)", scale: 1 }),
	CEIL: () => ({ kind: TRANSFORM_EXPRESSION, expr: "ceil(t * 10)", scale: 1 }),
	POW: (args) => ({ kind: TRANSFORM_EXPRESSION, expr: `pow(t, ${parseNumArg(args[0], 2)})`, scale: 1 }),
};

/** All known function names (for autocomplete) */
const TRANSFORM_FUNCTION_NAMES = Object.keys(TRANSFORM_FUNCTIONS);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a unified transform expression string.
 * Returns null if the input is empty or unparseable.
 *
 * @param input The expression string (e.g. "COS(tag:?)", "BIN(degree, 5)", "index")
 * @param fallbackSource Source to use for raw expression mode (e.g. "sin(t*2)")
 */
export function parseTransformExpr(input: string, fallbackSource?: AxisSource): TransformExprResult | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Try FUNC(source, args...) pattern
	const funcMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.+)\)$/);
	if (funcMatch) {
		const funcName = funcMatch[1].toUpperCase();
		const factory = TRANSFORM_FUNCTIONS[funcName];

		if (factory) {
			// Split arguments: first arg is the source, rest are transform params
			const allArgs = splitArgs(funcMatch[2]);
			const sourceStr = allArgs[0]?.trim() ?? "";
			const extraArgs = allArgs.slice(1).map((a) => a.trim());

			const source = parseAxisSource(sourceStr);
			if (!source) return null;

			const transform = factory(extraArgs);
			return { source, transform };
		}

		// Not a known function — might be raw expression like "sin(t * pi)"
		// Fall through to raw expression handling below
	}

	// Try plain source (no function wrapper) → linear transform
	const source = parseAxisSource(trimmed);
	if (source) {
		return { source, transform: { kind: TRANSFORM_LINEAR, scale: 1 } };
	}

	// Try matching against known curve formulas (math notation → curve transform)
	const curveMatch = matchCurveFormula(trimmed);
	if (curveMatch && fallbackSource) {
		return { source: fallbackSource, transform: curveMatch };
	}

	// Treat as raw expression if it contains 't' variable (e.g. "t * 2 + 1", "sin(t * pi)")
	if (fallbackSource && /\bt\b/.test(trimmed)) {
		return {
			source: fallbackSource,
			transform: { kind: TRANSFORM_EXPRESSION, expr: trimmed, scale: 1 },
		};
	}

	// Fallback: any non-empty string with a fallback source → expression
	if (fallbackSource) {
		return {
			source: fallbackSource,
			transform: { kind: TRANSFORM_EXPRESSION, expr: trimmed, scale: 1 },
		};
	}

	return null;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/** Convert an AxisSource + AxisTransform back to a unified expression string */
export function transformExprToString(source: AxisSource, transform: AxisTransform): string {
	const srcStr = axisSourceStr(source);

	switch (transform.kind) {
		case TRANSFORM_LINEAR:
			if (transform.scale === 1) return srcStr;
			return `${transform.scale}*t`;

		case TRANSFORM_BIN:
			return `BIN(${srcStr}, ${transform.count})`;

		case TRANSFORM_DATE_INDEX:
			return `DATE_INDEX(${srcStr})`;

		case TRANSFORM_STACK_AVOID:
			return `STACK(${srcStr})`;

		case TRANSFORM_GOLDEN:
			return `GOLDEN(${srcStr})`;

		case TRANSFORM_EVEN_DIVIDE:
			return `EVEN(${srcStr}, ${transform.totalRange})`;

		case TRANSFORM_CURVE: {
			// Display as mathematical formula
			const curveDef = CURVE_REGISTRY[transform.curve];
			if (curveDef) return curveDef.formula;
			// Fallback for unknown curves
			const name = curveToFuncName(transform.curve);
			return `${name}(t)`;
		}

		case TRANSFORM_EXPRESSION:
			return transform.expr;

		case TRANSFORM_SHAPE_FILL:
			return `SHAPE_FILL(${transform.shape})`;

		default:
			return "UNKNOWN";
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumArg(arg: string | undefined, fallback: number): number {
	if (!arg) return fallback;
	// Handle key=value args by extracting value
	const eqIdx = arg.indexOf("=");
	const numStr = eqIdx >= 0 ? arg.slice(eqIdx + 1) : arg;
	const v = parseFloat(numStr);
	return isNaN(v) ? fallback : v;
}

function makeCurveTransform(curve: CurveKind, extraArgs: string[]): AxisTransform {
	const def = CURVE_REGISTRY[curve];
	const params: Record<string, number> = def ? { ...def.defaultParams } : {};

	// Parse key=value pairs from extra args
	for (const arg of extraArgs) {
		const eqIdx = arg.indexOf("=");
		if (eqIdx >= 0) {
			const key = arg.slice(0, eqIdx).trim();
			const val = parseFloat(arg.slice(eqIdx + 1).trim());
			if (!isNaN(val)) params[key] = val;
		} else {
			// Positional: assign to parameter keys in order
			const keys = def ? Object.keys(def.defaultParams) : [];
			const idx = extraArgs.indexOf(arg);
			if (idx < keys.length) {
				const val = parseFloat(arg);
				if (!isNaN(val)) params[keys[idx]] = val;
			}
		}
	}

	return { kind: TRANSFORM_CURVE, curve, params, scale: 1 };
}

/** Split arguments respecting nested parentheses */
function splitArgs(str: string): string[] {
	const args: string[] = [];
	let depth = 0;
	let current = "";

	for (const ch of str) {
		if (ch === "(") {
			depth++;
			current += ch;
		} else if (ch === ")") {
			depth--;
			current += ch;
		} else if (ch === "," && depth === 0) {
			args.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current) args.push(current);
	return args;
}

// Re-use PanelBuilder's parseAxisSourceString logic inline
// (avoiding circular dependency)
const METRIC_NAMES = new Set(["degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank"]);

function parseAxisSource(s: string): AxisSource | null {
	const trimmed = s.trim();
	if (!trimmed) return null;

	if (trimmed === "index") return { kind: SOURCE_INDEX };
	if (METRIC_NAMES.has(trimmed)) return { kind: SOURCE_METRIC, metric: trimmed as import("../types").MetricKind };

	if (trimmed === "random") return { kind: SOURCE_RANDOM, seed: 42 };
	if (trimmed.startsWith("random:")) {
		const seed = parseInt(trimmed.slice(7), 10);
		return { kind: SOURCE_RANDOM, seed: isNaN(seed) ? 42 : seed };
	}

	if (trimmed === "const") return { kind: SOURCE_CONST, value: 1 };
	if (trimmed.startsWith("const:")) {
		const v = parseFloat(trimmed.slice(6));
		return { kind: SOURCE_CONST, value: isNaN(v) ? 1 : v };
	}

	if (trimmed.startsWith("hop:")) {
		const parts = trimmed.slice(4).split(":");
		const from = parts[0] || "";
		const maxDepth = parts[1] ? parseInt(parts[1], 10) : undefined;
		return { kind: SOURCE_HOP, from, ...(maxDepth != null && !isNaN(maxDepth) ? { maxDepth } : {}) };
	}

	// Everything else is a field
	return { kind: SOURCE_FIELD, field: trimmed };
}

function axisSourceStr(src: AxisSource): string {
	switch (src.kind) {
		case SOURCE_INDEX:
			return "index";
		case SOURCE_METRIC:
			return src.metric;
		case SOURCE_RANDOM:
			return src.seed === 42 ? "random" : `random:${src.seed}`;
		case SOURCE_CONST:
			return src.value === 1 ? "const" : `const:${src.value}`;
		case SOURCE_HOP: {
			let s = `hop:${src.from}`;
			if (src.maxDepth != null) s += `:${src.maxDepth}`;
			return s;
		}
		case SOURCE_FIELD:
			return src.field;
		case SOURCE_PROPERTY:
			return src.key;
		default:
			return "index";
	}
}

function curveToFuncName(curve: CurveKind): string {
	const MAP: Record<CurveKind, string> = {
		archimedean: "ARCHIMEDEAN",
		logarithmic: "LOG_SPIRAL",
		fermat: "FERMAT",
		hyperbolic: "HYPERBOLIC",
		cardioid: "CARDIOID",
		rose: "ROSE",
		lissajous: "LISSAJOUS",
		golden: "GOLDEN_SPIRAL",
	};
	return MAP[curve] ?? curve.toUpperCase();
}

function _formatCurveParams(curve: CurveKind, params?: Record<string, number>): string {
	if (!params) return "";
	const def = CURVE_REGISTRY[curve];
	if (!def) return "";

	const parts: string[] = [];
	for (const [key, defaultVal] of Object.entries(def.defaultParams)) {
		const val = params[key];
		if (val != null && val !== defaultVal) {
			parts.push(`${key}=${val}`);
		}
	}
	return parts.join(", ");
}

/** Try to reverse-map an expression string to a known math function name */
function _exprToMathFunc(expr: string): string | null {
	const normalized = expr.replace(/\s+/g, "");
	const MAP: Record<string, string> = {
		"sin(t*pi*2)": "SIN",
		"cos(t*pi*2)": "COS",
		"tan(t*pi)": "TAN",
		"sqrt(t)": "SQRT",
		"abs(t)": "ABS",
		"log(t+0.01)": "LOG",
		"exp(t)": "EXP",
		"floor(t*10)": "FLOOR",
		"ceil(t*10)": "CEIL",
	};
	return MAP[normalized] ?? null;
}

/**
 * Try to match an expression string against known curve formulas.
 * Returns a curve AxisTransform if matched, null otherwise.
 *
 * Example: "a + b*t" → { kind: "curve", curve: "archimedean", params: {a:0, b:1}, scale: 1 }
 */
function matchCurveFormula(input: string): AxisTransform | null {
	const normalized = input.replace(/\s+/g, "").toLowerCase();

	for (const [curveName, def] of Object.entries(CURVE_REGISTRY)) {
		const formulaNorm = def.formula.replace(/\s+/g, "").toLowerCase();
		if (normalized === formulaNorm) {
			return {
				kind: TRANSFORM_CURVE,
				curve: curveName as CurveKind,
				params: { ...def.defaultParams },
				scale: 1,
			};
		}
	}

	return null;
}

/** Get all suggestion strings for autocomplete in the transform expression input */
export function getTransformExprSuggestions(axisSources: string[]): string[] {
	const suggestions: string[] = [];

	// Plain sources (implicit linear)
	suggestions.push(...axisSources);

	// Function-wrapped examples with first source
	const exampleSource = axisSources[0] || "index";
	for (const func of TRANSFORM_FUNCTION_NAMES) {
		suggestions.push(`${func}(${exampleSource})`);
	}

	return suggestions;
}
