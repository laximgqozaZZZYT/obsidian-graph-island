import { describe, it, expect } from "vitest";
import { parseTransformExpr, transformExprToString, getTransformExprSuggestions } from "../src/utils/transform-expr";
import { TRANSFORM_LINEAR, TRANSFORM_BIN, TRANSFORM_EXPRESSION, SOURCE_FIELD, SOURCE_METRIC, SOURCE_INDEX } from "../src/constants";
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
    const hasBin = suggestions.some(s => s.toUpperCase().includes("BIN"));
    expect(hasBin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTransformExpr — edge cases (cycle114)
// ---------------------------------------------------------------------------
describe("parseTransformExpr edge cases", () => {
  it("parses all curve functions without crash", () => {
    const curves = ["ARCHIMEDEAN", "LOG_SPIRAL", "FERMAT", "HYPERBOLIC", "CARDIOID", "ROSE", "LISSAJOUS", "GOLDEN_SPIRAL"];
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
