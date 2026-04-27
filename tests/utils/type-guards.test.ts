import { describe, it, expect } from "vitest";
import {
	isNonNull,
	isString,
	isFiniteNumber,
	isBoolean,
	isRecord,
	isArray,
	isHTMLElement,
	isHTMLInputElement,
	isHTMLSelectElement,
	hasProperty,
} from "../../src/utils/type-guards";

describe("isNonNull", () => {
	it("rejects null and undefined", () => {
		expect(isNonNull(null)).toBe(false);
		expect(isNonNull(undefined)).toBe(false);
	});

	it("accepts primitives, objects, and falsy-but-defined values", () => {
		expect(isNonNull(0)).toBe(true);
		expect(isNonNull("")).toBe(true);
		expect(isNonNull(false)).toBe(true);
		expect(isNonNull({})).toBe(true);
		expect(isNonNull([])).toBe(true);
	});

	it("narrows to T at compile and run time", () => {
		const xs: (string | null)[] = ["a", null, "b", null, "c"];
		const result = xs.filter(isNonNull);
		expect(result).toEqual(["a", "b", "c"]);
		const lengths: number[] = result.map((s) => s.length);
		expect(lengths).toEqual([1, 1, 1]);
	});
});

describe("isString", () => {
	it("accepts strings", () => {
		expect(isString("")).toBe(true);
		expect(isString("hello")).toBe(true);
		expect(isString(String("x"))).toBe(true);
	});

	it("rejects non-strings", () => {
		expect(isString(0)).toBe(false);
		expect(isString(null)).toBe(false);
		expect(isString(undefined)).toBe(false);
		expect(isString({})).toBe(false);
		expect(isString([])).toBe(false);
	});
});

describe("isFiniteNumber", () => {
	it("accepts finite numbers including 0 and negatives", () => {
		expect(isFiniteNumber(0)).toBe(true);
		expect(isFiniteNumber(-1.5)).toBe(true);
		expect(isFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
	});

	it("rejects NaN, Infinity, and non-numbers", () => {
		expect(isFiniteNumber(Number.NaN)).toBe(false);
		expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
		expect(isFiniteNumber("1")).toBe(false);
		expect(isFiniteNumber(null)).toBe(false);
	});
});

describe("isBoolean", () => {
	it("accepts true and false", () => {
		expect(isBoolean(true)).toBe(true);
		expect(isBoolean(false)).toBe(true);
	});

	it("rejects truthy/falsy non-booleans", () => {
		expect(isBoolean(1)).toBe(false);
		expect(isBoolean(0)).toBe(false);
		expect(isBoolean("true")).toBe(false);
		expect(isBoolean(null)).toBe(false);
		expect(isBoolean(undefined)).toBe(false);
	});
});

describe("isRecord", () => {
	it("accepts plain objects", () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord({ a: 1 })).toBe(true);
		expect(isRecord(Object.create(null))).toBe(true);
	});

	it("rejects null, arrays, and primitives", () => {
		expect(isRecord(null)).toBe(false);
		expect(isRecord([])).toBe(false);
		expect(isRecord([1, 2])).toBe(false);
		expect(isRecord("str")).toBe(false);
		expect(isRecord(42)).toBe(false);
		expect(isRecord(undefined)).toBe(false);
	});

	it("narrows for dynamic key access", () => {
		const v: unknown = { foo: "bar" };
		if (isRecord(v)) {
			expect(v["foo"]).toBe("bar");
		} else {
			throw new Error("expected isRecord true");
		}
	});
});

describe("isArray", () => {
	it("accepts arrays (including empty and mixed)", () => {
		expect(isArray([])).toBe(true);
		expect(isArray([1, 2, 3])).toBe(true);
		expect(isArray(["a", 1, null])).toBe(true);
	});

	it("rejects non-arrays including array-like objects", () => {
		expect(isArray({})).toBe(false);
		expect(isArray("abc")).toBe(false);
		expect(isArray({ length: 0 })).toBe(false);
	});
});

describe("DOM type guards", () => {
	it("isHTMLElement returns false for non-DOM values", () => {
		expect(isHTMLElement(null)).toBe(false);
		expect(isHTMLElement({})).toBe(false);
		expect(isHTMLElement("div")).toBe(false);
	});

	it("isHTMLElement accepts a real div when DOM is available", () => {
		if (typeof document !== "undefined") {
			const div = document.createElement("div");
			expect(isHTMLElement(div)).toBe(true);
		}
	});

	it("isHTMLInputElement distinguishes <input> from <div>", () => {
		if (typeof document !== "undefined") {
			const input = document.createElement("input");
			const div = document.createElement("div");
			expect(isHTMLInputElement(input)).toBe(true);
			expect(isHTMLInputElement(div)).toBe(false);
		}
		expect(isHTMLInputElement(null)).toBe(false);
	});

	it("isHTMLSelectElement distinguishes <select> from <input>", () => {
		if (typeof document !== "undefined") {
			const select = document.createElement("select");
			const input = document.createElement("input");
			expect(isHTMLSelectElement(select)).toBe(true);
			expect(isHTMLSelectElement(input)).toBe(false);
		}
		expect(isHTMLSelectElement(undefined)).toBe(false);
	});
});

describe("hasProperty", () => {
	it("returns true when key exists on a record", () => {
		expect(hasProperty({ a: 1 }, "a")).toBe(true);
		expect(hasProperty({ a: undefined }, "a")).toBe(true);
	});

	it("returns false when key is missing or value is non-record", () => {
		expect(hasProperty({ a: 1 }, "b")).toBe(false);
		expect(hasProperty(null, "a")).toBe(false);
		expect(hasProperty([], "0")).toBe(false);
		expect(hasProperty("str", "length")).toBe(false);
	});

	it("narrows to allow safe property access on unknown input", () => {
		const v: unknown = { name: "graph" };
		if (hasProperty(v, "name")) {
			expect(typeof v.name === "string" ? v.name : "").toBe("graph");
		} else {
			throw new Error("expected hasProperty true");
		}
	});
});
