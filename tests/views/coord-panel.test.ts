import { describe, it, expect } from "vitest";
import {
	evalSource,
	evalTransform,
	parseAxisSourceString,
	axisSourceToString,
} from "../../src/views/coord-panel";
import type { AxisSource, AxisTransform } from "../../src/types";

// ---------------------------------------------------------------------------
// evalSource
// ---------------------------------------------------------------------------
describe("evalSource", () => {
	it("index returns normalized ramp [0..1]", () => {
		const src: AxisSource = { kind: "index" };
		expect(evalSource(src, 0, 10)).toBe(0);
		expect(evalSource(src, 9, 10)).toBe(1);
		expect(evalSource(src, 4, 10)).toBeCloseTo(4 / 9);
	});

	it("index with n=1 returns 0 (avoids division by zero)", () => {
		expect(evalSource({ kind: "index" }, 0, 1)).toBe(0);
	});

	it("random returns deterministic value in [0..1]", () => {
		const src: AxisSource = { kind: "random", seed: 42 };
		const v1 = evalSource(src, 0, 10);
		const v2 = evalSource(src, 0, 10);
		expect(v1).toBe(v2); // deterministic
		expect(v1).toBeGreaterThanOrEqual(0);
		expect(v1).toBeLessThanOrEqual(1);
	});

	it("random with different seeds gives different values", () => {
		const v1 = evalSource({ kind: "random", seed: 1 }, 5, 10);
		const v2 = evalSource({ kind: "random", seed: 999 }, 5, 10);
		expect(v1).not.toBe(v2);
	});

	it("const returns configured value", () => {
		expect(evalSource({ kind: "const", value: 3.14 }, 0, 10)).toBe(3.14);
	});

	it("const with undefined value returns 1", () => {
		expect(evalSource({ kind: "const" } as AxisSource, 0, 10)).toBe(1);
	});

	it("metric degree returns power-law ramp", () => {
		const src: AxisSource = { kind: "metric", metric: "degree" };
		const v = evalSource(src, 5, 10);
		const t = 5 / 9;
		expect(v).toBeCloseTo(Math.pow(t, 0.4));
	});

	it("metric bfs-depth returns discrete levels", () => {
		const src: AxisSource = { kind: "metric", metric: "bfs-depth" };
		const v = evalSource(src, 5, 10);
		const t = 5 / 9;
		expect(v).toBeCloseTo(Math.floor(t * 5) / 4);
	});

	it("metric sibling-rank returns sawtooth", () => {
		const src: AxisSource = { kind: "metric", metric: "sibling-rank" };
		const v = evalSource(src, 3, 10);
		const t = 3 / 9;
		expect(v).toBeCloseTo((t * 5) % 1);
	});

	it("metric unknown falls back to t", () => {
		const src = { kind: "metric", metric: "unknown" } as unknown as AxisSource;
		expect(evalSource(src, 4, 10)).toBeCloseTo(4 / 9);
	});

	it("property returns monotonic t", () => {
		const src = { kind: "property", key: "start-date" } as AxisSource;
		expect(evalSource(src, 3, 10)).toBeCloseTo(3 / 9);
	});

	it("field returns discrete steps", () => {
		const src: AxisSource = { kind: "field", field: "category" };
		const v = evalSource(src, 5, 10);
		const t = 5 / 9;
		expect(v).toBeCloseTo(Math.floor(t * 6) / 5);
	});
});

// ---------------------------------------------------------------------------
// evalTransform
// ---------------------------------------------------------------------------
describe("evalTransform", () => {
	it("linear scales input by factor", () => {
		const tr: AxisTransform = { kind: "linear", scale: 2 };
		expect(evalTransform(tr, 0.5, 0, 10)).toBe(1.0);
	});

	it("linear with default scale=1", () => {
		const tr = { kind: "linear" } as AxisTransform;
		expect(evalTransform(tr, 0.7, 0, 10)).toBeCloseTo(0.7);
	});

	it("bin quantizes into count buckets", () => {
		const tr: AxisTransform = { kind: "bin", count: 4 };
		// t=0.6 → floor(0.6*4)=2, 2/3 ≈ 0.667
		expect(evalTransform(tr, 0.6, 0, 10)).toBeCloseTo(2 / 3);
	});

	it("bin with count=1 always returns 0", () => {
		const tr: AxisTransform = { kind: "bin", count: 1 };
		expect(evalTransform(tr, 0.5, 0, 10)).toBe(0);
	});

	it("bin with count=0 treated as 1", () => {
		const tr: AxisTransform = { kind: "bin", count: 0 };
		expect(evalTransform(tr, 0.99, 0, 10)).toBe(0);
	});

	it("date-to-index is identity", () => {
		const tr: AxisTransform = { kind: "date-to-index" };
		expect(evalTransform(tr, 0.42, 3, 10)).toBe(0.42);
	});

	it("golden-angle uses index-based angle", () => {
		const tr: AxisTransform = { kind: "golden-angle" };
		const v = evalTransform(tr, 0, 3, 10);
		expect(v).toBeCloseTo((3 * 2.3999632297286535) % (Math.PI * 2));
	});

	it("even-divide maps [0..1] to [0..totalRange radians]", () => {
		const tr: AxisTransform = { kind: "even-divide", totalRange: 360 };
		expect(evalTransform(tr, 1.0, 0, 10)).toBeCloseTo(2 * Math.PI);
		expect(evalTransform(tr, 0.5, 0, 10)).toBeCloseTo(Math.PI);
	});

	it("even-divide defaults to 360 when totalRange missing", () => {
		const tr = { kind: "even-divide" } as AxisTransform;
		expect(evalTransform(tr, 1.0, 0, 10)).toBeCloseTo(2 * Math.PI);
	});

	it("stack-avoid adds small jitter based on index", () => {
		const tr: AxisTransform = { kind: "stack-avoid" };
		const base = 0.5;
		const v = evalTransform(tr, base, 7, 10);
		expect(v).toBeCloseTo(base + Math.sin(7 * 9.1) * 0.05);
	});

	it("curve with unknown curve returns t passthrough", () => {
		const tr = { kind: "curve", curve: "nonexistent" } as unknown as AxisTransform;
		expect(evalTransform(tr, 0.3, 0, 10)).toBe(0.3);
	});

	it("curve with archimedean preset applies formula", () => {
		const tr: AxisTransform = { kind: "curve", curve: "archimedean", params: { a: 0, b: 1 } };
		const v = evalTransform(tr, 0.5, 2, 10);
		// archimedean: a + b*t where t = 0.5*10 = 5
		expect(v).toBeCloseTo(5);
	});

	it("expression evaluates math expression", () => {
		const tr: AxisTransform = { kind: "expression", expr: "t * 2", scale: 1 };
		const v = evalTransform(tr, 0.3, 2, 10);
		// t = 0.3*10 = 3, so t*2 = 6, * scale 1 = 6
		expect(v).toBe(6);
	});

	it("expression with invalid expr falls back to t", () => {
		const tr: AxisTransform = { kind: "expression", expr: "???invalid!!!" };
		const v = evalTransform(tr, 0.5, 0, 10);
		expect(v).toBe(0.5);
	});

	it("expression uses constants", () => {
		const tr: AxisTransform = { kind: "expression", expr: "k + t" };
		const v = evalTransform(tr, 0.1, 0, 10, { k: 100 });
		// t = 0.1*10 = 1, k = 100, result = 101, scale default 1
		expect(v).toBe(101);
	});

	it("unknown transform kind returns t", () => {
		const tr = { kind: "unknown-thing" } as unknown as AxisTransform;
		expect(evalTransform(tr, 0.77, 0, 10)).toBe(0.77);
	});
});

// ---------------------------------------------------------------------------
// parseAxisSourceString
// ---------------------------------------------------------------------------
describe("parseAxisSourceString", () => {
	it("empty string returns null", () => {
		expect(parseAxisSourceString("")).toBeNull();
		expect(parseAxisSourceString("   ")).toBeNull();
	});

	it("'index' → { kind: index }", () => {
		expect(parseAxisSourceString("index")).toEqual({ kind: "index" });
	});

	it("metric names parsed correctly", () => {
		expect(parseAxisSourceString("degree")).toEqual({ kind: "metric", metric: "degree" });
		expect(parseAxisSourceString("in-degree")).toEqual({ kind: "metric", metric: "in-degree" });
		expect(parseAxisSourceString("out-degree")).toEqual({ kind: "metric", metric: "out-degree" });
		expect(parseAxisSourceString("bfs-depth")).toEqual({ kind: "metric", metric: "bfs-depth" });
		expect(parseAxisSourceString("sibling-rank")).toEqual({ kind: "metric", metric: "sibling-rank" });
	});

	it("'random' → seed 42 default", () => {
		expect(parseAxisSourceString("random")).toEqual({ kind: "random", seed: 42 });
	});

	it("'random:123' → seed 123", () => {
		expect(parseAxisSourceString("random:123")).toEqual({ kind: "random", seed: 123 });
	});

	it("'random:abc' → seed 42 fallback", () => {
		expect(parseAxisSourceString("random:abc")).toEqual({ kind: "random", seed: 42 });
	});

	it("'const' → value 1 default", () => {
		expect(parseAxisSourceString("const")).toEqual({ kind: "const", value: 1 });
	});

	it("'const:3.14' → value 3.14", () => {
		expect(parseAxisSourceString("const:3.14")).toEqual({ kind: "const", value: 3.14 });
	});

	it("'const:abc' → value 1 fallback", () => {
		expect(parseAxisSourceString("const:abc")).toEqual({ kind: "const", value: 1 });
	});

	it("'hop:NodeA' → hop with from", () => {
		expect(parseAxisSourceString("hop:NodeA")).toEqual({ kind: "hop", from: "NodeA" });
	});

	it("'hop:NodeA:5' → hop with maxDepth", () => {
		expect(parseAxisSourceString("hop:NodeA:5")).toEqual({ kind: "hop", from: "NodeA", maxDepth: 5 });
	});

	it("'hop' alone → empty from", () => {
		expect(parseAxisSourceString("hop")).toEqual({ kind: "hop", from: "" });
	});

	it("built-in fields → field kind", () => {
		for (const f of ["path", "file", "folder", "tag", "category", "id", "isTag"]) {
			expect(parseAxisSourceString(f)).toEqual({ kind: "field", field: f });
		}
	});

	it("field with trailing ':?' stripped", () => {
		expect(parseAxisSourceString("tag:?")).toEqual({ kind: "field", field: "tag" });
	});

	it("field with trailing ':*' stripped", () => {
		expect(parseAxisSourceString("custom:*")).toEqual({ kind: "field", field: "custom" });
	});

	it("field with trailing ':' stripped", () => {
		expect(parseAxisSourceString("myfield:")).toEqual({ kind: "field", field: "myfield" });
	});

	it("arbitrary string → frontmatter field", () => {
		expect(parseAxisSourceString("story_order")).toEqual({ kind: "field", field: "story_order" });
	});

	it("whitespace trimmed", () => {
		expect(parseAxisSourceString("  index  ")).toEqual({ kind: "index" });
	});
});

// ---------------------------------------------------------------------------
// axisSourceToString
// ---------------------------------------------------------------------------
describe("axisSourceToString", () => {
	it("index → 'index'", () => {
		expect(axisSourceToString({ kind: "index" })).toBe("index");
	});

	it("metric → metric name", () => {
		expect(axisSourceToString({ kind: "metric", metric: "degree" })).toBe("degree");
		expect(axisSourceToString({ kind: "metric", metric: "bfs-depth" })).toBe("bfs-depth");
	});

	it("random with default seed → 'random'", () => {
		expect(axisSourceToString({ kind: "random", seed: 42 })).toBe("random");
	});

	it("random with custom seed → 'random:N'", () => {
		expect(axisSourceToString({ kind: "random", seed: 7 })).toBe("random:7");
	});

	it("const with default value → 'const'", () => {
		expect(axisSourceToString({ kind: "const", value: 1 })).toBe("const");
	});

	it("const with custom value → 'const:N'", () => {
		expect(axisSourceToString({ kind: "const", value: 5 })).toBe("const:5");
	});

	it("hop → 'hop:from'", () => {
		expect(axisSourceToString({ kind: "hop", from: "NodeA" })).toBe("hop:NodeA");
	});

	it("hop with maxDepth → 'hop:from:N'", () => {
		expect(axisSourceToString({ kind: "hop", from: "NodeA", maxDepth: 3 })).toBe("hop:NodeA:3");
	});

	it("field → field name", () => {
		expect(axisSourceToString({ kind: "field", field: "category" })).toBe("category");
	});

	it("property → key (legacy)", () => {
		expect(axisSourceToString({ kind: "property", key: "start-date" })).toBe("start-date");
	});

	it("unknown kind → 'index' fallback", () => {
		expect(axisSourceToString({ kind: "bogus" } as unknown as AxisSource)).toBe("index");
	});

	it("roundtrip: parse(toString(src)) preserves source", () => {
		const sources: AxisSource[] = [
			{ kind: "index" },
			{ kind: "random", seed: 42 },
			{ kind: "random", seed: 99 },
			{ kind: "const", value: 1 },
			{ kind: "const", value: 2.5 },
			{ kind: "metric", metric: "degree" },
			{ kind: "hop", from: "X" },
			{ kind: "hop", from: "Y", maxDepth: 4 },
			{ kind: "field", field: "folder" },
		];
		for (const src of sources) {
			const str = axisSourceToString(src);
			const parsed = parseAxisSourceString(str);
			expect(parsed).toEqual(src);
		}
	});
});
