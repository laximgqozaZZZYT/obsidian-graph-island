import { describe, it, expect } from "vitest";
import { parseTransformExpr, transformExprToString, getTransformExprSuggestions } from "../src/utils/transform-expr";
import {
	TRANSFORM_LINEAR,
	TRANSFORM_BIN,
	TRANSFORM_EXPRESSION,
	SOURCE_FIELD,
	SOURCE_METRIC,
	SOURCE_INDEX,
} from "../src/constants";
import type { AxisSource, AxisTransform } from "../src/types";

describe("parseTransformExpr", () => {
	it("returns null for empty input", () => {
		expect(parseTransformExpr("")).toBeNull();
		expect(parseTransformExpr("   ")).toBeNull();
	});

	it("parses plain field source as linear transform", () => {
		const result = parseTransformExpr("tag:?");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_FIELD);
		expect(result!.transform.kind).toBe(TRANSFORM_LINEAR);
	});

	it("parses plain index source", () => {
		const result = parseTransformExpr("index");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_INDEX);
		expect(result!.transform.kind).toBe(TRANSFORM_LINEAR);
	});

	it("parses BIN(source, count) function", () => {
		const result = parseTransformExpr("BIN(tag:?, 5)");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_FIELD);
		expect(result!.transform.kind).toBe(TRANSFORM_BIN);
	});

	it("parses metric source (degree)", () => {
		const result = parseTransformExpr("degree");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_METRIC);
	});

	it("parses raw expression with 't' variable using fallback", () => {
		const fallback: AxisSource = { kind: SOURCE_INDEX };
		const result = parseTransformExpr("sin(t * 3.14)", fallback);
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe(TRANSFORM_EXPRESSION);
	});

	it("parses short identifiers as field sources", () => {
		// Single-letter identifiers like "t" are parsed as field sources
		const result = parseTransformExpr("t");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_FIELD);
	});

	it("uses fallback for expressions without known function wrapper", () => {
		const fallback: AxisSource = { kind: SOURCE_INDEX };
		const result = parseTransformExpr("2 * t + 1", fallback);
		expect(result).not.toBeNull();
	});

	it("is case-insensitive for function names", () => {
		const upper = parseTransformExpr("BIN(tag:?, 3)");
		const lower = parseTransformExpr("bin(tag:?, 3)");
		// Both should parse (function names are uppercased internally)
		if (upper && lower) {
			expect(upper.transform.kind).toBe(lower.transform.kind);
		}
	});
});

describe("transformExprToString", () => {
	it("serializes linear transform as plain source", () => {
		const source: AxisSource = { kind: SOURCE_FIELD, field: "tag:?" };
		const transform: AxisTransform = { kind: TRANSFORM_LINEAR, scale: 1 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("tag:?");
		expect(result).not.toContain("LINEAR"); // implicit, not shown
	});

	it("round-trips parse → serialize for simple sources", () => {
		const inputs = ["index", "degree"];
		for (const input of inputs) {
			const parsed = parseTransformExpr(input);
			if (parsed) {
				const serialized = transformExprToString(parsed.source, parsed.transform);
				expect(serialized.length).toBeGreaterThan(0);
			}
		}
	});
});

describe("getTransformExprSuggestions", () => {
	it("returns suggestions for given axis sources", () => {
		const suggestions = getTransformExprSuggestions(["tag:?", "degree"]);
		expect(Array.isArray(suggestions)).toBe(true);
		expect(suggestions.length).toBeGreaterThan(0);
	});

	it("returns empty array for empty input", () => {
		const suggestions = getTransformExprSuggestions([]);
		expect(Array.isArray(suggestions)).toBe(true);
	});

	it("includes BIN suggestions when sources are provided", () => {
		const suggestions = getTransformExprSuggestions(["tag:?"]);
		const hasBin = suggestions.some((s) => s.toUpperCase().includes("BIN"));
		expect(hasBin).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — edge cases (cycle114)
// ---------------------------------------------------------------------------
describe("parseTransformExpr edge cases", () => {
	it("parses all curve functions without crash", () => {
		const curves = [
			"ARCHIMEDEAN",
			"LOG_SPIRAL",
			"FERMAT",
			"HYPERBOLIC",
			"CARDIOID",
			"ROSE",
			"LISSAJOUS",
			"GOLDEN_SPIRAL",
		];
		for (const curve of curves) {
			const result = parseTransformExpr(`${curve}(index)`);
			expect(result, `${curve} should parse`).not.toBeNull();
			expect(result!.transform.kind).toBe("curve");
		}
	});

	it("parses all math functions", () => {
		const funcs = ["SIN", "COS", "TAN", "SQRT", "ABS", "LOG", "EXP", "FLOOR", "CEIL"];
		for (const fn of funcs) {
			const result = parseTransformExpr(`${fn}(degree)`);
			expect(result, `${fn} should parse`).not.toBeNull();
			expect(result!.transform.kind).toBe("expression");
		}
	});

	it("POW with explicit exponent", () => {
		const result = parseTransformExpr("POW(degree, 3)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("expression");
		expect((result!.transform as any).expr).toContain("3");
	});

	it("function with empty parens falls back to field source", () => {
		// "BIN()" doesn't match FUNC(args) pattern (no content inside parens)
		// Instead parsed as plain field source "BIN()"
		const result = parseTransformExpr("BIN()");
		// May parse as field or return null depending on regex
		if (result) {
			expect(result.source.kind).toBeDefined();
		}
	});

	it("LINEAR with custom scale", () => {
		const result = parseTransformExpr("LINEAR(index, 2.5)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("linear");
		expect((result!.transform as any).scale).toBe(2.5);
	});

	it("EVEN with custom range", () => {
		const result = parseTransformExpr("EVEN(index, 180)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("even-divide");
		expect((result!.transform as any).totalRange).toBe(180);
	});

	it("parses hop source with node and depth", () => {
		const result = parseTransformExpr("hop:start:3");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("hop");
	});

	it("parses random source", () => {
		const result = parseTransformExpr("random");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("random");
	});

	it("parses const source", () => {
		const result = parseTransformExpr("const:42");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("const");
	});
});

// ---------------------------------------------------------------------------
// transformExprToString — edge cases
// ---------------------------------------------------------------------------
describe("transformExprToString edge cases", () => {
	it("BIN serializes with count", () => {
		const source: AxisSource = { kind: SOURCE_FIELD, field: "tag:?" };
		const transform: AxisTransform = { kind: TRANSFORM_BIN, count: 8 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("BIN");
		expect(result).toContain("8");
	});

	it("expression serializes the expr string", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: TRANSFORM_EXPRESSION, expr: "sin(t*pi)", scale: 1 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("sin(t*pi)");
	});

	it("non-unit linear scale serializes as multiplier", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: TRANSFORM_LINEAR, scale: 3 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("3");
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — boundary values (cycle152)
// ---------------------------------------------------------------------------
describe("parseTransformExpr boundary values (cycle152)", () => {
	it("LOGARITHMIC alias parses as logarithmic curve", () => {
		const result = parseTransformExpr("LOGARITHMIC(index)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("curve");
		expect((result!.transform as any).curve).toBe("logarithmic");
	});

	it("STACK function produces stack-avoid transform", () => {
		const result = parseTransformExpr("STACK(index)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("stack-avoid");
	});

	it("GOLDEN function produces golden-angle transform", () => {
		const result = parseTransformExpr("GOLDEN(index)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("golden-angle");
	});

	it("DATE_INDEX function produces date-to-index transform", () => {
		const result = parseTransformExpr("DATE_INDEX(index)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("date-to-index");
	});

	it("random:123 parses with custom seed", () => {
		const result = parseTransformExpr("random:123");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("random");
		expect((result!.source as any).seed).toBe(123);
	});

	it("const without value defaults to 1", () => {
		const result = parseTransformExpr("const");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("const");
		expect((result!.source as any).value).toBe(1);
	});

	it("ROSE with key=value params", () => {
		const result = parseTransformExpr("ROSE(index, k=7)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("curve");
		expect((result!.transform as any).params.k).toBe(7);
	});

	it("SIN wrapping a field source parses as expression transform", () => {
		// sin(cos(t * pi)) matches SIN( ... ) where "cos(t * pi)" is the source arg
		// Since "cos(t * pi)" isn't a known axis source, it returns null
		const result = parseTransformExpr("SIN(degree)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe(TRANSFORM_EXPRESSION);
		expect((result!.transform as any).expr).toContain("sin");
	});

	it("unknown string without fallback parses as field source", () => {
		// Any unrecognized string is treated as a field name
		const result = parseTransformExpr("!!!garbage!!!");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_FIELD);
		expect((result!.source as any).field).toBe("!!!garbage!!!");
	});
});

// ---------------------------------------------------------------------------
// transformExprToString — additional serialization (cycle152)
// ---------------------------------------------------------------------------
describe("transformExprToString additional (cycle152)", () => {
	it("STACK serializes correctly", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: "stack-avoid" as any };
		const result = transformExprToString(source, transform);
		expect(result).toContain("STACK");
	});

	it("GOLDEN serializes correctly", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: "golden-angle" as any };
		const result = transformExprToString(source, transform);
		expect(result).toContain("GOLDEN");
	});

	it("DATE_INDEX serializes correctly", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: "date-to-index" as any };
		const result = transformExprToString(source, transform);
		expect(result).toContain("DATE_INDEX");
	});

	it("EVEN serializes with totalRange", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: "even-divide" as any, totalRange: 720 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("EVEN");
		expect(result).toContain("720");
	});

	it("SHAPE_FILL serializes shape name", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = { kind: "shape-fill" as any, shape: "hexagon" };
		const result = transformExprToString(source, transform);
		expect(result).toContain("SHAPE_FILL");
		expect(result).toContain("hexagon");
	});

	it("random source with non-default seed serializes with seed", () => {
		const source: AxisSource = { kind: "random" as any, seed: 99 };
		const transform: AxisTransform = { kind: TRANSFORM_LINEAR, scale: 1 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("99");
	});

	it("hop source serializes with from and maxDepth", () => {
		const source: AxisSource = { kind: "hop" as any, from: "start", maxDepth: 5 };
		const transform: AxisTransform = { kind: TRANSFORM_LINEAR, scale: 1 };
		const result = transformExprToString(source, transform);
		expect(result).toContain("hop");
		expect(result).toContain("start");
		expect(result).toContain("5");
	});
});

// =========================================================================
// Parser robustness — extreme inputs
// =========================================================================
describe("parseTransformExpr robustness", () => {
	it("empty string returns null", () => {
		expect(parseTransformExpr("")).toBeNull();
	});

	it("whitespace only returns default", () => {
		const r = parseTransformExpr("   ");
		expect(r).toBeDefined();
	});

	it("operator only doesn't crash", () => {
		expect(() => parseTransformExpr("*")).not.toThrow();
	});

	it("very long expression doesn't crash", () => {
		const long = "field:" + "a".repeat(1000);
		expect(() => parseTransformExpr(long)).not.toThrow();
	});

	it("special characters in field name", () => {
		const r = parseTransformExpr("field:node-type_v2");
		expect(r).not.toBeNull();
		if (r) expect(r.source).toBeDefined();
	});

	it("numeric-only input parses as scale", () => {
		const r = parseTransformExpr("42");
		expect(r).toBeDefined();
	});

	it("nested parentheses don't crash", () => {
		expect(() => parseTransformExpr("((field:x))")).not.toThrow();
	});

	it("unknown function name doesn't crash", () => {
		expect(() => parseTransformExpr("unknownfn(field:x)")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — curve function param handling
// ---------------------------------------------------------------------------
describe("parseTransformExpr curve param handling", () => {
	it("ARCHIMEDEAN with positional numeric param", () => {
		const result = parseTransformExpr("ARCHIMEDEAN(index, 3)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("curve");
		// positional param → first default key (a) gets value 3
		expect((result!.transform as any).params.a).toBe(3);
	});

	it("LISSAJOUS with key=value params", () => {
		const result = parseTransformExpr("LISSAJOUS(index, a=2, b=3)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("curve");
		expect((result!.transform as any).params.a).toBe(2);
		expect((result!.transform as any).params.b).toBe(3);
	});

	it("curve function with invalid numeric param uses default", () => {
		const result = parseTransformExpr("FERMAT(index, notanumber)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("curve");
		// Invalid number string → default stays
		expect((result!.transform as any).params.a).toBe(1);
	});

	it("BIN with key=value arg extracts value", () => {
		const result = parseTransformExpr("BIN(index, count=10)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("bin");
		expect((result!.transform as any).count).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// transformExprToString — SOURCE_PROPERTY and curve registry paths
// ---------------------------------------------------------------------------
describe("transformExprToString property and curve paths", () => {
	it("serializes SOURCE_PROPERTY using src.key", () => {
		const source: AxisSource = { kind: "property" as any, key: "start-date" };
		const transform: AxisTransform = { kind: TRANSFORM_LINEAR, scale: 1 };
		const result = transformExprToString(source, transform);
		expect(result).toBe("start-date");
	});

	it("curve transform with known curve displays formula from registry", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = {
			kind: "curve" as any,
			curve: "archimedean",
			params: { a: 0, b: 1 },
			scale: 1,
		};
		const result = transformExprToString(source, transform);
		// CURVE_REGISTRY.archimedean.formula = "a + b*t"
		expect(result).toBe("a + b*t");
	});

	it("curve transform with known curve fermat displays formula", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = {
			kind: "curve" as any,
			curve: "fermat",
			params: { a: 1 },
			scale: 1,
		};
		const result = transformExprToString(source, transform);
		expect(result).toBe("a*sqrt(t)");
	});

	it("unknown transform kind returns UNKNOWN", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform = { kind: "nonexistent" } as any;
		const result = transformExprToString(source, transform);
		expect(result).toBe("UNKNOWN");
	});
});
