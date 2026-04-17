import { describe, it, expect } from "vitest";
import { formatGridValue } from "../src/layouts/coordinate-engine";

// =========================================================================
// formatGridValue — boundary values
// =========================================================================
describe("formatGridValue boundary", () => {
	it("zero spacing uses decimal format", () => {
		expect(formatGridValue(3.14, 0)).toBe("3.1");
	});

	it("large value without spacing omits decimals", () => {
		expect(formatGridValue(12345.6, 0)).toBe("12346");
	});

	it("exact grid value returns integer", () => {
		expect(formatGridValue(100, 50)).toBe("2");
	});

	it("negative grid value", () => {
		expect(formatGridValue(-150, 50)).toBe("-3");
	});

	it("zero value on grid", () => {
		expect(formatGridValue(0, 10)).toBe("0");
	});

	it("very small spacing", () => {
		const r = formatGridValue(0.001, 0.001);
		expect(Number.isFinite(Number(r))).toBe(true);
	});

	it("negative zero spacing uses decimal", () => {
		expect(formatGridValue(-0.5, 0)).toBe("-0.5");
	});

	it("exact integer with spacing returns clean string", () => {
		expect(formatGridValue(300, 100)).toBe("3");
	});

	it("near-integer normalizes correctly", () => {
		// 99.9999 / 50 ≈ 2.0 → should round to "2"
		expect(formatGridValue(99.9999, 50)).toBe("2");
	});

	it("large negative value", () => {
		expect(formatGridValue(-99999, 0)).toBe("-99999");
	});
});
