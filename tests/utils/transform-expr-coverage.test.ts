import { describe, it, expect } from "vitest";
import { parseTransformExpr, transformExprToString } from "../../src/utils/transform-expr";
import { TRANSFORM_CURVE, TRANSFORM_LINEAR, SOURCE_INDEX, SOURCE_FIELD } from "../../src/constants";
import type { AxisSource, AxisTransform } from "../../src/types";

// ---------------------------------------------------------------------------
// transformExprToString — curve path with registry-miss (curveToFuncName fallback)
// ---------------------------------------------------------------------------
describe("transformExprToString curve fallback path", () => {
	it("unknown curve kind falls back to curveToFuncName + '(t)'", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		// Inject an unknown curve kind; CURVE_REGISTRY has no entry → fall through
		const transform: AxisTransform = {
			kind: TRANSFORM_CURVE,
			curve: "mystery_curve" as any,
			params: {},
			scale: 1,
		};
		const result = transformExprToString(source, transform);
		// MAP lookup misses → falls to curve.toUpperCase() + "(t)"
		expect(result).toBe("MYSTERY_CURVE(t)");
	});

	it("known curves use CURVE_REGISTRY.formula (not curveToFuncName)", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = {
			kind: TRANSFORM_CURVE,
			curve: "rose" as any,
			params: {},
			scale: 1,
		};
		const result = transformExprToString(source, transform);
		// rose is in registry → returns formula, not "ROSE(t)"
		expect(result).not.toBe("ROSE(t)");
	});

	it("logarithmic curve serializes as its registry formula", () => {
		const source: AxisSource = { kind: SOURCE_INDEX };
		const transform: AxisTransform = {
			kind: TRANSFORM_CURVE,
			curve: "logarithmic" as any,
			params: { a: 1, b: 0.3 },
			scale: 1,
		};
		const result = transformExprToString(source, transform);
		expect(result).toBe("a*exp(b*t*tau)");
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — makeCurveTransform positional/key=value param mixing
// ---------------------------------------------------------------------------
describe("parseTransformExpr curve function param edge cases", () => {
	it("positional arg beyond default-param count is silently ignored", () => {
		// ARCHIMEDEAN has 2 params (a, b); fourth arg has no mapping
		const result = parseTransformExpr("ARCHIMEDEAN(index, 5, 10, 99)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe(TRANSFORM_CURVE);
		const params = (result!.transform as any).params;
		expect(params.a).toBe(5);
		expect(params.b).toBe(10);
		// no params["2"] or params["3"] — third positional has no key
	});

	it("bare curve with no args preserves all defaults", () => {
		// ROSE defaults include k; no args means defaults kept as-is
		const result = parseTransformExpr("ROSE(index)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe(TRANSFORM_CURVE);
		const params = (result!.transform as any).params;
		expect(typeof params.k).toBe("number");
	});

	it("key=value mixed with positional (positional first, then key=val)", () => {
		const result = parseTransformExpr("LISSAJOUS(index, 2, b=7)");
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe(TRANSFORM_CURVE);
		const params = (result!.transform as any).params;
		// first positional → first default key (a=2)
		expect(params.a).toBe(2);
		// explicit b=7 overrides default
		expect(params.b).toBe(7);
	});

	it("key=value with NaN value keeps default", () => {
		// "b=notnum" → parseFloat NaN → skipped
		const result = parseTransformExpr("ARCHIMEDEAN(index, b=notnum)");
		expect(result).not.toBeNull();
		const params = (result!.transform as any).params;
		// default b is 1, should be preserved
		expect(params.b).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — splitArgs nested parens
// ---------------------------------------------------------------------------
describe("parseTransformExpr splitArgs nested parens", () => {
	it("comma inside nested parens is not treated as arg separator", () => {
		// Outer: BIN( nested(a,b) , 5 ) → first arg is "nested(a,b)", second is "5"
		// nested(a,b) is not a valid source → returns null
		const result = parseTransformExpr("BIN(nested(a,b), 5)");
		// parseAxisSource on "nested(a,b)" returns SOURCE_FIELD (everything else path)
		// So result is non-null with field source "nested(a,b)"
		expect(result).not.toBeNull();
		expect(result!.transform.kind).toBe("bin");
		expect((result!.transform as any).count).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// parseTransformExpr — default fallback to field source for unrecognized strings
// ---------------------------------------------------------------------------
describe("parseTransformExpr field-source default behavior", () => {
	it("arbitrary expression without known prefix becomes field source", () => {
		// "a + b*t" doesn't match known prefix nor FUNC(args) — field fallback
		const result = parseTransformExpr("a + b*t");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe(SOURCE_FIELD);
		expect(result!.transform.kind).toBe(TRANSFORM_LINEAR);
		expect((result!.transform as any).scale).toBe(1);
	});

	it("hop source with non-numeric depth drops maxDepth", () => {
		// parseInt("abc") is NaN → maxDepth stays undefined
		const result = parseTransformExpr("hop:start:abc");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("hop");
		expect((result!.source as any).from).toBe("start");
		expect((result!.source as any).maxDepth).toBeUndefined();
	});

	it("hop source without depth has no maxDepth", () => {
		const result = parseTransformExpr("hop:target");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("hop");
		expect((result!.source as any).maxDepth).toBeUndefined();
	});

	it("random source with non-numeric seed defaults to 42", () => {
		// parseInt("notaseed") → NaN → seed fallback = 42
		const result = parseTransformExpr("random:notaseed");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("random");
		expect((result!.source as any).seed).toBe(42);
	});

	it("const source with non-numeric value defaults to 1", () => {
		const result = parseTransformExpr("const:notanum");
		expect(result).not.toBeNull();
		expect(result!.source.kind).toBe("const");
		expect((result!.source as any).value).toBe(1);
	});
});
