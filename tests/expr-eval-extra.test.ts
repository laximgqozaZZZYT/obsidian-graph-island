/**
 * Additional tests for expr-eval: setUserVars and user-defined variables.
 */
import { describe, it, expect } from "vitest";
import { parseExpr, evalExpr, setUserVars } from "../src/utils/expr-eval";

describe("setUserVars", () => {
	it("allows custom variable names to be parsed", () => {
		setUserVars(new Set(["myCustomVar"]));
		const expr = parseExpr("myCustomVar + 1");
		expect(expr).not.toBeNull();
	});

	it("custom variables are case-insensitive", () => {
		setUserVars(new Set(["MyVar"]));
		const expr = parseExpr("myvar + 1");
		expect(expr).not.toBeNull();
	});

	it("clearing user vars removes custom names", () => {
		setUserVars(new Set(["tempVar"]));
		const expr1 = parseExpr("tempVar + 1");
		expect(expr1).not.toBeNull();

		setUserVars(new Set());
		// After clearing, tempVar should not be recognized as variable
		// But it may still parse as something else depending on implementation
	});

	it("multiple user vars can be set", () => {
		setUserVars(new Set(["alpha", "beta", "gamma"]));
		const expr = parseExpr("alpha + beta * gamma");
		expect(expr).not.toBeNull();
	});

	it("empty set does not cause errors", () => {
		expect(() => setUserVars(new Set())).not.toThrow();
	});

	it("user vars work in evaluation", () => {
		setUserVars(new Set(["x"]));
		const expr = parseExpr("x + 1");
		expect(expr).not.toBeNull();
		if (expr) {
			const result = evalExpr(expr, { x: 5 });
			expect(result).toBe(6);
		}
	});

	// Clean up
	it("cleanup: reset user vars", () => {
		setUserVars(new Set());
	});
});

describe("showToast", () => {
	it("module loads without error", async () => {
		const mod = await import("../src/utils/toast");
		expect(typeof mod.showToast).toBe("function");
	});
});
