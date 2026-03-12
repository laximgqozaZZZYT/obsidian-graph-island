import { describe, it, expect } from "vitest";
import { parseExpr, evalExpr, validateExpr, type ExprVars } from "../src/utils/expr-eval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultVars: ExprVars = { t: 0.5, i: 3, n: 10, v: 42 };

function evaluate(expr: string, vars: Partial<ExprVars> = {}): number {
  const ast = parseExpr(expr);
  return evalExpr(ast, { ...defaultVars, ...vars });
}

// ---------------------------------------------------------------------------
// parseExpr — basic parsing
// ---------------------------------------------------------------------------

describe("parseExpr", () => {
  it("parses a simple number", () => {
    const ast = parseExpr("42");
    expect(ast).toEqual({ type: "number", value: 42 });
  });

  it("parses a decimal number", () => {
    const ast = parseExpr("3.14");
    expect(ast).toEqual({ type: "number", value: 3.14 });
  });

  it("parses a variable", () => {
    const ast = parseExpr("t");
    expect(ast).toEqual({ type: "variable", name: "t" });
  });

  it("parses constants (pi, e, tau)", () => {
    expect(evaluate("pi")).toBeCloseTo(Math.PI);
    expect(evaluate("e")).toBeCloseTo(Math.E);
    expect(evaluate("tau")).toBeCloseTo(Math.PI * 2);
  });

  it("throws on empty input", () => {
    expect(() => parseExpr("")).toThrow();
    expect(() => parseExpr("   ")).toThrow();
  });

  it("throws on unknown identifier", () => {
    expect(() => parseExpr("xyz")).toThrow(/Unknown identifier/);
  });

  it("throws on unknown function", () => {
    expect(() => parseExpr("foobar(1)")).toThrow(/Unknown function/);
  });
});

// ---------------------------------------------------------------------------
// evalExpr — arithmetic operations
// ---------------------------------------------------------------------------

describe("evalExpr — arithmetic", () => {
  it("addition", () => {
    expect(evaluate("2 + 3")).toBe(5);
  });

  it("subtraction", () => {
    expect(evaluate("10 - 4")).toBe(6);
  });

  it("multiplication", () => {
    expect(evaluate("3 * 4")).toBe(12);
  });

  it("division", () => {
    expect(evaluate("10 / 4")).toBe(2.5);
  });

  it("modulo", () => {
    expect(evaluate("7 % 3")).toBe(1);
  });

  it("power", () => {
    expect(evaluate("2 ^ 3")).toBe(8);
  });

  it("unary minus", () => {
    expect(evaluate("-5")).toBe(-5);
  });

  it("unary plus", () => {
    expect(evaluate("+5")).toBe(5);
  });

  it("parentheses", () => {
    expect(evaluate("(2 + 3) * 4")).toBe(20);
  });

  it("operator precedence: * before +", () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
  });

  it("operator precedence: ^ before *", () => {
    expect(evaluate("2 * 3 ^ 2")).toBe(18);
  });

  it("right-associative power", () => {
    expect(evaluate("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2) = 2^9
  });

  it("division by zero returns 0", () => {
    expect(evaluate("1 / 0")).toBe(0);
  });

  it("modulo by zero returns 0", () => {
    expect(evaluate("1 % 0")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// evalExpr — variables
// ---------------------------------------------------------------------------

describe("evalExpr — variables", () => {
  it("reads t variable", () => {
    expect(evaluate("t", { t: 0.75 })).toBe(0.75);
  });

  it("reads i variable", () => {
    expect(evaluate("i", { i: 7 })).toBe(7);
  });

  it("reads n variable", () => {
    expect(evaluate("n", { n: 100 })).toBe(100);
  });

  it("reads v variable", () => {
    expect(evaluate("v", { v: 99 })).toBe(99);
  });

  it("combines variables in expression", () => {
    expect(evaluate("t * n + i", { t: 0.5, n: 10, i: 3 })).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// evalExpr — functions
// ---------------------------------------------------------------------------

describe("evalExpr — functions", () => {
  it("sin", () => {
    expect(evaluate("sin(0)")).toBeCloseTo(0);
    expect(evaluate("sin(pi / 2)")).toBeCloseTo(1);
  });

  it("cos", () => {
    expect(evaluate("cos(0)")).toBeCloseTo(1);
    expect(evaluate("cos(pi)")).toBeCloseTo(-1);
  });

  it("tan", () => {
    expect(evaluate("tan(0)")).toBeCloseTo(0);
  });

  it("sqrt", () => {
    expect(evaluate("sqrt(9)")).toBeCloseTo(3);
  });

  it("abs", () => {
    expect(evaluate("abs(-5)")).toBe(5);
  });

  it("log", () => {
    expect(evaluate("log(e)")).toBeCloseTo(1);
  });

  it("exp", () => {
    expect(evaluate("exp(0)")).toBe(1);
    expect(evaluate("exp(1)")).toBeCloseTo(Math.E);
  });

  it("floor and ceil", () => {
    expect(evaluate("floor(3.7)")).toBe(3);
    expect(evaluate("ceil(3.2)")).toBe(4);
  });

  it("min and max (multi-arg)", () => {
    expect(evaluate("min(3, 1, 2)")).toBe(1);
    expect(evaluate("max(3, 1, 2)")).toBe(3);
  });

  it("pow", () => {
    expect(evaluate("pow(2, 10)")).toBe(1024);
  });

  it("atan2", () => {
    expect(evaluate("atan2(1, 1)")).toBeCloseTo(Math.PI / 4);
  });

  it("nested function calls", () => {
    expect(evaluate("abs(sin(pi))")).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// evalExpr — complex expressions
// ---------------------------------------------------------------------------

describe("evalExpr — complex expressions", () => {
  it("spiral-like: t * sin(t * tau)", () => {
    const result = evaluate("t * sin(t * tau)", { t: 0.25 });
    expect(result).toBeCloseTo(0.25 * Math.sin(0.25 * Math.PI * 2));
  });

  it("golden angle distribution", () => {
    const result = evaluate("sqrt(i) * cos(i * 2.399)", { i: 5 });
    expect(result).toBeCloseTo(Math.sqrt(5) * Math.cos(5 * 2.399));
  });

  it("clamped NaN/Infinity returns 0", () => {
    expect(evaluate("sqrt(-1)")).toBe(0); // NaN → 0
    expect(evaluate("log(0)")).toBe(0);   // -Infinity → 0
  });
});

// ---------------------------------------------------------------------------
// validateExpr
// ---------------------------------------------------------------------------

describe("validateExpr", () => {
  it("returns null for valid expressions", () => {
    expect(validateExpr("t * 2 + 1")).toBeNull();
    expect(validateExpr("sin(t * pi)")).toBeNull();
    expect(validateExpr("max(t, 0.5)")).toBeNull();
  });

  it("returns error for invalid expressions", () => {
    expect(validateExpr("")).not.toBeNull();
    expect(validateExpr("2 +")).not.toBeNull();
    expect(validateExpr("unknown_var")).not.toBeNull();
    expect(validateExpr("badFunc(1)")).not.toBeNull();
  });

  it("returns error message string", () => {
    const err = validateExpr("xyz");
    expect(typeof err).toBe("string");
    expect(err!.length).toBeGreaterThan(0);
  });
});
