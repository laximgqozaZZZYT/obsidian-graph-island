import { describe, it, expect } from "vitest";
import {
	extractInitials,
	computePriorityScores,
	type PriorityInput,
	estimateTextWidth,
	computeRotatedAABB,
	smartTruncateLabel,
	selectLabelMode,
	type LabelMode,
} from "../src/views/LabelManager";

// ---------------------------------------------------------------------------
// extractInitials — 2-character initials from label text
// ---------------------------------------------------------------------------
describe("extractInitials", () => {
	it("extracts initials from path-separated segments", () => {
		expect(extractInitials("classic-othello/characters")).toBe("OC");
	});

	it("extracts from hyphenated segments", () => {
		expect(extractInitials("dark-fantasy")).toBe("DF");
	});

	it("extracts from underscore-separated segments", () => {
		expect(extractInitials("node_type")).toBe("NT");
	});

	it("extracts from space-separated segments", () => {
		expect(extractInitials("hello world")).toBe("HW");
	});

	it("uses first two chars for single word", () => {
		expect(extractInitials("mythology")).toBe("MY");
	});

	it("strips group suffix like (15)", () => {
		expect(extractInitials("fantasy (15)")).toBe("FA");
	});

	it("strips group suffix with multi-digit count", () => {
		expect(extractInitials("action/heroes (123)")).toBe("AH");
	});

	it("handles multi-segment path — uses last two", () => {
		expect(extractInitials("a/b/c/deep/leaf")).toBe("DL");
	});

	it("uppercases results", () => {
		expect(extractInitials("hello-world")).toBe("HW");
		expect(extractInitials("Hello-World")).toBe("HW");
	});

	it("handles single character input", () => {
		expect(extractInitials("x")).toBe("X");
	});

	it("handles empty string", () => {
		expect(extractInitials("")).toBe("");
	});

	it("handles Japanese text (single segment)", () => {
		expect(extractInitials("神話")).toBe("神話");
	});

	it("handles Japanese path-separated segments", () => {
		expect(extractInitials("歴史/人物")).toBe("歴人");
	});

	it("handles mixed separators", () => {
		expect(extractInitials("a-b/c_d")).toBe("CD");
	});

	it("ignores leading/trailing whitespace in segments", () => {
		expect(extractInitials("  alpha  beta  ")).toBe("AB");
	});
});

// ---------------------------------------------------------------------------
// computePriorityScores — LOD tier assignment for label visibility
// ---------------------------------------------------------------------------
const defaultRT = {
	labelZoomTier1: 0.15,
	labelZoomTier2: 0.35,
	labelZoomTier3: 0.7,
	labelDegreePctTier1: 0.1,
	labelDegreePctTier2: 0.3,
	labelDegreePctTier3: 0.5,
	nodeLabelZoomMin: 0.9,
};

function mkInput(id: string, opts?: { isSuper?: boolean; hasLabel?: boolean }): PriorityInput {
	return { id, isSuper: opts?.isSuper ?? false, hasLabel: opts?.hasLabel ?? true };
}

describe("computePriorityScores", () => {
	it("returns empty array for empty input", () => {
		expect(computePriorityScores([], new Map(), defaultRT)).toEqual([]);
	});

	it("assigns higher score to super nodes", () => {
		const nodes = [mkInput("a"), mkInput("b", { isSuper: true })];
		const degrees = new Map([
			["a", 5],
			["b", 5],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);
		const scoreA = result.find((r) => r.id === "a")!.priorityScore;
		const scoreB = result.find((r) => r.id === "b")!.priorityScore;
		expect(scoreB).toBeGreaterThan(scoreA);
	});

	it("assigns higher score to higher-degree nodes", () => {
		const nodes = [mkInput("low"), mkInput("high")];
		const degrees = new Map([
			["low", 1],
			["high", 100],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);
		const scoreLow = result.find((r) => r.id === "low")!.priorityScore;
		const scoreHigh = result.find((r) => r.id === "high")!.priorityScore;
		expect(scoreHigh).toBeGreaterThan(scoreLow);
	});

	it("assigns minShowZoom based on rank tier", () => {
		// Create 20 nodes with varying degrees
		const nodes = Array.from({ length: 20 }, (_, i) => mkInput(`n${i}`));
		const degrees = new Map(nodes.map((n, i) => [n.id, 20 - i])); // n0=20, n19=1
		const result = computePriorityScores(nodes, degrees, defaultRT);
		// Top priority node (n0, degree=20) should have lowest minShowZoom
		const topNode = result.find((r) => r.id === "n0")!;
		const bottomNode = result.find((r) => r.id === "n19")!;
		expect(topNode.minShowZoom).toBeLessThan(bottomNode.minShowZoom);
	});

	it("nodes without labels get minShowZoom=0", () => {
		const nodes = [mkInput("a", { hasLabel: false }), mkInput("b")];
		const degrees = new Map([
			["a", 10],
			["b", 5],
		]);
		const result = computePriorityScores(nodes, degrees, defaultRT);
		const noLabel = result.find((r) => r.id === "a")!;
		expect(noLabel.minShowZoom).toBe(0);
	});

	it("all zero degrees gives equal scores", () => {
		const nodes = [mkInput("a"), mkInput("b"), mkInput("c")];
		const degrees = new Map<string, number>();
		const result = computePriorityScores(nodes, degrees, defaultRT);
		const scores = result.map((r) => r.priorityScore);
		expect(new Set(scores).size).toBe(1); // all same
	});

	it("respects nodeLabelZoomMin for lowest-tier nodes", () => {
		const nodes = Array.from({ length: 10 }, (_, i) => mkInput(`n${i}`));
		const degrees = new Map(nodes.map((n, i) => [n.id, 10 - i]));
		const customRT = { ...defaultRT, nodeLabelZoomMin: 1.5 };
		const result = computePriorityScores(nodes, degrees, customRT);
		// Bottom-tier node should get the custom floor
		const bottom = result.find((r) => r.id === "n9")!;
		expect(bottom.minShowZoom).toBe(1.5);
	});

	it("top 1% nodes get tier1 * 0.2 minShowZoom", () => {
		// Need 100+ nodes so top 1% = 1 node
		const nodes = Array.from({ length: 100 }, (_, i) => mkInput(`n${i}`));
		const degrees = new Map(nodes.map((n, i) => [n.id, 100 - i]));
		const result = computePriorityScores(nodes, degrees, defaultRT);
		const topNode = result.find((r) => r.id === "n0")!;
		expect(topNode.minShowZoom).toBeCloseTo(0.15 * 0.2, 5); // 0.03
	});

	it("single node gets lowest tier zoom", () => {
		const nodes = [mkInput("solo")];
		const degrees = new Map([["solo", 5]]);
		const result = computePriorityScores(nodes, degrees, defaultRT);
		expect(result[0].minShowZoom).toBe(0.15 * 0.2); // pct=0 < lodPct1*0.1=0.01 → tier1*0.2
	});
});

// ---------------------------------------------------------------------------
// estimateTextWidth — character-count based width heuristic
// ---------------------------------------------------------------------------
describe("estimateTextWidth", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTextWidth("", 11, false)).toBe(0);
	});

	it("normal text uses 0.58 multiplier", () => {
		expect(estimateTextWidth("Hello", 10, false)).toBeCloseTo(5 * 10 * 0.58);
	});

	it("bold text uses 0.65 multiplier", () => {
		expect(estimateTextWidth("Hello", 10, true)).toBeCloseTo(5 * 10 * 0.65);
	});

	it("scales linearly with font size", () => {
		const w10 = estimateTextWidth("abc", 10, false);
		const w20 = estimateTextWidth("abc", 20, false);
		expect(w20).toBeCloseTo(w10 * 2);
	});

	it("scales linearly with text length", () => {
		const w3 = estimateTextWidth("abc", 11, false);
		const w6 = estimateTextWidth("abcdef", 11, false);
		expect(w6).toBeCloseTo(w3 * 2);
	});
});

// ---------------------------------------------------------------------------
// computeRotatedAABB — axis-aligned bounding box for rotated rectangle
// ---------------------------------------------------------------------------
describe("computeRotatedAABB", () => {
	it("no rotation returns original dimensions", () => {
		const r = computeRotatedAABB(100, 20, 0, 0, 0, 50, 50);
		expect(r.w).toBeCloseTo(100);
		expect(r.h).toBeCloseTo(20);
		expect(r.x).toBe(50);
		expect(r.y).toBe(50);
	});

	it("90° rotation swaps width and height", () => {
		const r = computeRotatedAABB(100, 20, Math.PI / 2, 0, 0, 0, 0);
		expect(r.w).toBeCloseTo(20, 0);
		expect(r.h).toBeCloseTo(100, 0);
	});

	it("45° rotation: AABB width < original width but height > original height", () => {
		const r = computeRotatedAABB(100, 20, Math.PI / 4, 0, 0, 0, 0);
		// cos(45°)*100 + sin(45°)*20 ≈ 84.85 (width shrinks because h is small)
		// sin(45°)*100 + cos(45°)*20 ≈ 84.85 (height grows significantly)
		expect(r.h).toBeGreaterThan(20);
		// Both dimensions should be equal for 45° when w≠h
		expect(r.w).toBeCloseTo(r.h, 5);
	});

	it("anchor shifts position", () => {
		const r0 = computeRotatedAABB(100, 20, 0, 0, 0, 50, 50);
		const r5 = computeRotatedAABB(100, 20, 0, 0.5, 0.5, 50, 50);
		expect(r5.x).toBeLessThan(r0.x);
		expect(r5.y).toBeLessThan(r0.y);
	});

	it("180° rotation preserves dimensions", () => {
		const r = computeRotatedAABB(100, 20, Math.PI, 0, 0, 0, 0);
		expect(r.w).toBeCloseTo(100, 0);
		expect(r.h).toBeCloseTo(20, 0);
	});
});

// ---------------------------------------------------------------------------
// smartTruncateLabel — path-aware truncation
// ---------------------------------------------------------------------------
describe("smartTruncateLabel", () => {
	it("returns full text when under maxChars", () => {
		expect(smartTruncateLabel("short", 10)).toBe("short");
	});

	it("truncates slash paths to parent/child hint", () => {
		const result = smartTruncateLabel("classic-othello/characters/desdemona", 10);
		expect(result).toContain("/");
		expect(result.length).toBeLessThan(36);
	});

	it("truncates dash-prefixed text to after-dash", () => {
		const result = smartTruncateLabel("ep001-the-beginning-of-everything", 10);
		expect(result).not.toContain("ep001-");
	});

	it("falls back to ellipsis for plain long text", () => {
		const result = smartTruncateLabel("abcdefghijklmnopqrstuvwxyz", 10);
		expect(result).toContain("\u2026");
		expect(result.length).toBe(10);
	});

	it("handles text exactly at maxChars boundary", () => {
		expect(smartTruncateLabel("1234567890", 10)).toBe("1234567890");
	});

	it("handles single character maxChars", () => {
		const result = smartTruncateLabel("abcdef", 1);
		expect(result.length).toBeLessThanOrEqual(2); // 0 chars + ellipsis or similar
	});
});

// ---------------------------------------------------------------------------
// selectLabelMode — zoom-based mode FSM with hysteresis
// ---------------------------------------------------------------------------
describe("selectLabelMode", () => {
	const iz = 0.2; // initialsZoom
	const tz = 0.35; // truncateZoom
	const h = 0.02; // hysteresis

	it("returns initials below initialsZoom", () => {
		expect(selectLabelMode(0.1, "full", iz, tz, h)).toBe("initials");
	});

	it("returns truncated between initialsZoom and truncateZoom", () => {
		expect(selectLabelMode(0.25, "full", iz, tz, h)).toBe("truncated");
	});

	it("returns full above truncateZoom", () => {
		expect(selectLabelMode(0.5, "initials", iz, tz, h)).toBe("full");
	});

	it("hysteresis: stays in initials within band", () => {
		// zoom=0.21 is above initialsZoom(0.2) but within hysteresis(+0.02)
		expect(selectLabelMode(0.21, "initials", iz, tz, h)).toBe("initials");
	});

	it("hysteresis: stays in full within band", () => {
		// zoom=0.34 is below truncateZoom(0.35) but within hysteresis(-0.02)
		expect(selectLabelMode(0.34, "full", iz, tz, h)).toBe("full");
	});

	it("transitions from initials to truncated past hysteresis", () => {
		expect(selectLabelMode(0.23, "initials", iz, tz, h)).toBe("truncated");
	});

	it("transitions from full to truncated below hysteresis", () => {
		expect(selectLabelMode(0.25, "full", iz, tz, h)).toBe("truncated");
	});
});

// =========================================================================
// smartTruncateLabel — edge cases
// =========================================================================
describe("smartTruncateLabel edge cases", () => {
	it("emoji text truncates without breaking", () => {
		const r = smartTruncateLabel("🌟🌙🌈🎉🎊🎄🎁", 4);
		expect(r.length).toBeLessThanOrEqual(5);
	});

	it("newline-containing text truncates", () => {
		const r = smartTruncateLabel("line1\nline2\nline3", 8);
		expect(r.length).toBeLessThanOrEqual(9);
	});

	it("maxChars=0 still produces a string", () => {
		const r = smartTruncateLabel("hello world", 0);
		expect(typeof r).toBe("string");
		// Implementation produces ellipsis-truncated result; just verify no crash
	});

	it("maxChars=1 returns ellipsis or single char", () => {
		const r = smartTruncateLabel("hello", 1);
		expect(r.length).toBeLessThanOrEqual(2);
	});

	it("empty string returns empty", () => {
		expect(smartTruncateLabel("", 10)).toBe("");
	});

	it("text exactly at maxChars returns unchanged", () => {
		expect(smartTruncateLabel("abcde", 5)).toBe("abcde");
	});

	it("mixed CJK and ASCII", () => {
		const r = smartTruncateLabel("日本語テスト-label", 8);
		expect(r.length).toBeLessThanOrEqual(10);
	});
});

// ===========================================================================
// selectLabelMode — zoom-based mode with hysteresis
// ===========================================================================

describe("selectLabelMode", () => {
	const IZ = 0.2; // initialsZoom
	const TZ = 0.5; // truncateZoom
	const H = 0.05; // hysteresis

	it("returns 'initials' below initialsZoom", () => {
		expect(selectLabelMode(0.1, "full", IZ, TZ, H)).toBe("initials");
	});

	it("returns 'truncated' between initialsZoom and truncateZoom", () => {
		expect(selectLabelMode(0.35, "full", IZ, TZ, H)).toBe("truncated");
	});

	it("returns 'full' above truncateZoom", () => {
		expect(selectLabelMode(0.6, "truncated", IZ, TZ, H)).toBe("full");
	});

	it("hysteresis: stays 'initials' slightly above initialsZoom", () => {
		// prevMode=initials, zoom=0.22 < initialsZoom(0.2) + hyst(0.05) = 0.25
		expect(selectLabelMode(0.22, "initials", IZ, TZ, H)).toBe("initials");
	});

	it("hysteresis: stays 'full' slightly below truncateZoom", () => {
		// prevMode=full, zoom=0.48 > truncateZoom(0.5) - hyst(0.05) = 0.45
		expect(selectLabelMode(0.48, "full", IZ, TZ, H)).toBe("full");
	});

	it("transitions from 'initials' to 'truncated' when above hysteresis band", () => {
		// zoom=0.3 > initialsZoom(0.2) + hyst(0.05) = 0.25
		expect(selectLabelMode(0.3, "initials", IZ, TZ, H)).toBe("truncated");
	});

	it("transitions from 'full' to 'truncated' when below hysteresis band", () => {
		// zoom=0.4 < truncateZoom(0.5) - hyst(0.05) = 0.45
		expect(selectLabelMode(0.4, "full", IZ, TZ, H)).toBe("truncated");
	});
});

// ===========================================================================
// estimateTextWidth — character-count heuristic
// ===========================================================================

describe("estimateTextWidth", () => {
	it("wider for bold text", () => {
		const normal = estimateTextWidth("hello", 14, false);
		const bold = estimateTextWidth("hello", 14, true);
		expect(bold).toBeGreaterThan(normal);
	});

	it("proportional to text length", () => {
		const short = estimateTextWidth("hi", 14, false);
		const long = estimateTextWidth("hello world", 14, false);
		expect(long).toBeGreaterThan(short);
		expect(long / short).toBeCloseTo(11 / 2, 0);
	});

	it("proportional to fontSize", () => {
		const small = estimateTextWidth("test", 10, false);
		const large = estimateTextWidth("test", 20, false);
		expect(large).toBeCloseTo(small * 2, 0);
	});

	it("returns 0 for empty string", () => {
		expect(estimateTextWidth("", 14, false)).toBe(0);
	});
});

// ===========================================================================
// computeRotatedAABB — axis-aligned bounding box for rotated rect
// ===========================================================================

describe("computeRotatedAABB", () => {
	it("no rotation returns original rect", () => {
		const aabb = computeRotatedAABB(100, 50, 0, 0.5, 0.5, 200, 100);
		expect(aabb.w).toBeCloseTo(100);
		expect(aabb.h).toBeCloseTo(50);
		expect(aabb.x).toBeCloseTo(150); // 200 - 100*0.5
		expect(aabb.y).toBeCloseTo(75); // 100 - 50*0.5
	});

	it("90° rotation swaps width and height", () => {
		const aabb = computeRotatedAABB(100, 50, Math.PI / 2, 0.5, 0.5, 0, 0);
		expect(aabb.w).toBeCloseTo(50, 0); // height becomes width
		expect(aabb.h).toBeCloseTo(100, 0); // width becomes height
	});

	it("45° rotation expands bounding box", () => {
		const aabb = computeRotatedAABB(100, 50, Math.PI / 4, 0.5, 0.5, 0, 0);
		// Rotated 45°: max dimension ≈ (100+50) * cos(45°) ≈ 106.1
		expect(aabb.w).toBeGreaterThan(100);
		expect(aabb.h).toBeGreaterThan(50);
	});

	it("anchor (0,0) positions AABB at the pivot", () => {
		const aabb = computeRotatedAABB(100, 50, 0, 0, 0, 10, 20);
		expect(aabb.x).toBe(10);
		expect(aabb.y).toBe(20);
	});
});
