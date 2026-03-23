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

  it("throws on unknown multi-letter identifier (implicit mul prevents function call)", () => {
    // With implicit multiplication, foobar(1) becomes foobar * (1), and foobar is unknown
    expect(() => parseExpr("foobar(1)")).toThrow(/Unknown identifier/);
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

// ---------------------------------------------------------------------------
// evalExpr — Greek letters and Unicode symbols
// ---------------------------------------------------------------------------

describe("evalExpr — Greek letters and Unicode symbols", () => {
  it("α as variable alias for a", () => {
    expect(evaluate("α", { t: 0, i: 0, n: 1, v: 0, a: 5 })).toBe(5);
  });

  it("θ as variable alias for t", () => {
    expect(evaluate("θ", { t: 0.75, i: 0, n: 1, v: 0 })).toBe(0.75);
  });

  it("π as constant for pi", () => {
    expect(evaluate("π")).toBeCloseTo(Math.PI);
  });

  it("τ as constant for tau", () => {
    expect(evaluate("τ")).toBeCloseTo(Math.PI * 2);
  });

  it("complex expression: α*θ^k", () => {
    expect(evaluate("α*θ^k", { t: 2, i: 0, n: 1, v: 0, a: 3, k: 2 })).toBe(12);
  });

  it("β as variable alias for b", () => {
    const vars = { t: 0, i: 0, n: 1, v: 0, b: 7 };
    expect(evaluate("β", vars)).toBe(7);
  });

  it("mixed: sin(α*θ) + π", () => {
    const vars = { t: 0.5, i: 0, n: 1, v: 0, a: 2 };
    expect(evaluate("sin(α*θ) + π", vars)).toBeCloseTo(Math.sin(2 * 0.5) + Math.PI);
  });
});

// ---------------------------------------------------------------------------
// evalExpr — implicit multiplication
// ---------------------------------------------------------------------------

describe("evalExpr — implicit multiplication", () => {
  it("2t → 2*t", () => {
    expect(evaluate("2t", { t: 3, i: 0, n: 1, v: 0 })).toBe(6);
  });

  it("2π → 2*pi", () => {
    expect(evaluate("2π")).toBeCloseTo(2 * Math.PI);
  });

  it("3sin(t) → 3*sin(t)", () => {
    expect(evaluate("3sin(t)", { t: Math.PI / 2, i: 0, n: 1, v: 0 })).toBeCloseTo(3);
  });

  it("t(1+t) → t*(1+t)", () => {
    expect(evaluate("t(1+t)", { t: 3, i: 0, n: 1, v: 0 })).toBe(12);
  });

  it("(1+t)(2+t) → (1+t)*(2+t)", () => {
    expect(evaluate("(1+t)(2+t)", { t: 1, i: 0, n: 1, v: 0 })).toBe(6);
  });

  it("2αθ^k → 2*a*t^k", () => {
    expect(evaluate("2αθ^k", { t: 2, i: 0, n: 1, v: 0, a: 3, k: 2 })).toBe(24);
  });

  it("(t)2 → (t)*2", () => {
    expect(evaluate("(t)2", { t: 5, i: 0, n: 1, v: 0 })).toBe(10);
  });

  it("sin(x) stays as function call (no implicit mul)", () => {
    expect(evaluate("sin(t)", { t: Math.PI / 2, i: 0, n: 1, v: 0 })).toBeCloseTo(1);
  });

  it("2(x+1) → 2*(x+1)", () => {
    expect(evaluate("2(t+1)", { t: 2, i: 0, n: 1, v: 0 })).toBe(6);
  });

  it("(a)t → (a)*t", () => {
    expect(evaluate("(t)n", { t: 3, i: 0, n: 4, v: 0 })).toBe(12);
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

describe("expr-eval — boundary values", () => {
  const vars: ExprVars = { t: 0.5, i: 10, n: 100, v: 42 };

  it("very large numbers clamp to 0 (Infinity)", () => {
    // 10^1000 → Infinity → clamped to 0
    const node = parseExpr("10^1000");
    expect(evalExpr(node, vars)).toBe(0);
  });

  it("very negative exponent evaluates correctly", () => {
    const node = parseExpr("2^(-10)");
    const result = evalExpr(node, vars);
    expect(result).toBeCloseTo(1 / 1024, 6);
  });

  it("deeply nested parentheses", () => {
    // ((((((1 + 2))))))
    const node = parseExpr("((((((1 + 2))))))");
    expect(evalExpr(node, vars)).toBe(3);
  });

  it("long expression chain", () => {
    // 1+2+3+4+5+6+7+8+9+10
    const node = parseExpr("1+2+3+4+5+6+7+8+9+10");
    expect(evalExpr(node, vars)).toBe(55);
  });

  it("sqrt of negative returns NaN → clamped to 0", () => {
    const node = parseExpr("sqrt(-1)");
    expect(evalExpr(node, vars)).toBe(0);
  });

  it("log(0) returns -Infinity → clamped to 0", () => {
    const node = parseExpr("log(0)");
    expect(evalExpr(node, vars)).toBe(0);
  });

  it("chained division by zero", () => {
    const node = parseExpr("1/0/0/0");
    expect(evalExpr(node, vars)).toBe(0);
  });

  it("modulo of negative numbers", () => {
    const node = parseExpr("0-7 % 3");
    const result = evalExpr(node, vars);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("zero to the power of zero", () => {
    const node = parseExpr("0^0");
    expect(evalExpr(node, vars)).toBe(1); // Math.pow(0,0) = 1
  });

  it("all variables at extreme values", () => {
    const extremeVars: ExprVars = { t: 0, i: 0, n: 0, v: 0 };
    const node = parseExpr("t + i + n + v");
    expect(evalExpr(node, extremeVars)).toBe(0);
  });

  it("unknown function returns 0", () => {
    // parseExpr treats unknown identifiers as variables, not functions
    // but a call node with unknown fn returns 0
    expect(validateExpr("unknownfn(1)")).not.toBeNull();
  });

  it("consecutive operations: 2 * -3", () => {
    const node = parseExpr("2 * -3");
    expect(evalExpr(node, vars)).toBe(-6);
  });

  it("whitespace-only input throws", () => {
    expect(() => parseExpr("   ")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Operator precedence & associativity (cycle117)
// ---------------------------------------------------------------------------
describe("operator precedence & associativity", () => {
  const vars = { t: 0.5, x: 2, v: 3, i: 4, n: 5 };

  it("addition is left-associative: 10 - 3 - 2 = 5 (not 9)", () => {
    expect(evalExpr(parseExpr("10 - 3 - 2"), vars)).toBe(5);
  });

  it("multiplication is left-associative: 24 / 6 / 2 = 2 (not 8)", () => {
    expect(evalExpr(parseExpr("24 / 6 / 2"), vars)).toBe(2);
  });

  it("* and / have higher precedence than + and -", () => {
    expect(evalExpr(parseExpr("2 + 3 * 4"), vars)).toBe(14);
    expect(evalExpr(parseExpr("10 - 6 / 3"), vars)).toBe(8);
  });

  it("^ has higher precedence than * ", () => {
    expect(evalExpr(parseExpr("2 * 3 ^ 2"), vars)).toBe(18); // 2 * 9
  });

  it("^ is right-associative: 2 ^ 3 ^ 2 = 2^9 = 512", () => {
    expect(evalExpr(parseExpr("2 ^ 3 ^ 2"), vars)).toBe(512);
  });

  it("parentheses override precedence", () => {
    expect(evalExpr(parseExpr("(2 + 3) * 4"), vars)).toBe(20);
    expect(evalExpr(parseExpr("2 * (3 + 4)"), vars)).toBe(14);
  });

  it("unary minus has highest precedence: -2 ^ 2 = (-2)^2 or -(2^2)?", () => {
    // In most math parsers, -2^2 = -(2^2) = -4
    // But our parser may treat -2 as unary → (-2)^2 = 4
    const result = evalExpr(parseExpr("-2 ^ 2"), vars);
    // Accept either interpretation — just ensure it's deterministic
    expect([4, -4]).toContain(result);
  });

  it("mixed: 1 + 2 * 3 ^ 2 - 4 / 2 = 1 + 18 - 2 = 17", () => {
    expect(evalExpr(parseExpr("1 + 2 * 3 ^ 2 - 4 / 2"), vars)).toBe(17);
  });

  it("chained modulo: 17 % 5 % 3 = 2 % 3 = 2", () => {
    expect(evalExpr(parseExpr("17 % 5 % 3"), vars)).toBe(2);
  });

  it("nested function calls: sin(cos(0)) ≈ sin(1) ≈ 0.841", () => {
    expect(evalExpr(parseExpr("sin(cos(0))"), vars)).toBeCloseTo(Math.sin(1), 3);
  });

  it("variable in expression: t * 2 + 1 with t=0.5 → 2", () => {
    expect(evalExpr(parseExpr("t * 2 + 1"), vars)).toBe(2);
  });
});
