/**
 * LabelManager — boundary tests for smartTruncateLabel, selectLabelMode,
 * estimateTextWidth, computeRotatedAABB, extractInitials
 */
import { describe, it, expect } from "vitest";
import {
  smartTruncateLabel,
  selectLabelMode,
  estimateTextWidth,
  computeRotatedAABB,
  extractInitials,
  type LabelMode,
} from "../src/views/LabelManager";

// ---------------------------------------------------------------------------
// smartTruncateLabel — path-aware truncation
// ---------------------------------------------------------------------------
describe("smartTruncateLabel boundary", () => {
  it("returns original when under maxChars", () => {
    expect(smartTruncateLabel("short", 20)).toBe("short");
  });

  it("returns original at exact maxChars", () => {
    expect(smartTruncateLabel("12345", 5)).toBe("12345");
  });

  it("truncates slash path: parent/child hint", () => {
    const result = smartTruncateLabel("classic-hamlet/characters", 10);
    // Should show parent hint + /child hint
    expect(result).toContain("/");
    expect(result.length).toBeLessThanOrEqual(15); // reasonably short
  });

  it("truncates with dash: takes after-dash portion", () => {
    const result = smartTruncateLabel("mythology-japanese", 10);
    expect(result).toContain("japanese");
  });

  it("falls back to ellipsis for plain text", () => {
    const result = smartTruncateLabel("abcdefghijklmnop", 8);
    expect(result).toContain("\u2026");
    expect(result.length).toBe(8);
  });

  it("handles empty string", () => {
    expect(smartTruncateLabel("", 10)).toBe("");
  });

  it("handles maxChars of 1", () => {
    const result = smartTruncateLabel("abcdef", 1);
    // Should return ellipsis
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("handles slash at end", () => {
    const result = smartTruncateLabel("some-path/", 5);
    // slash at end with empty child
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("handles slash at beginning", () => {
    const result = smartTruncateLabel("/leading", 5);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("handles deep path: uses last slash", () => {
    const result = smartTruncateLabel("a/b/c/verylongname", 8);
    expect(result).toContain("/");
  });
});

// ---------------------------------------------------------------------------
// selectLabelMode — zoom-based mode with hysteresis
// ---------------------------------------------------------------------------
describe("selectLabelMode boundary", () => {
  it("returns initials below initialsZoom", () => {
    expect(selectLabelMode(0.1, "full", 0.3, 0.6, 0.05)).toBe("initials");
  });

  it("returns full above truncateZoom", () => {
    expect(selectLabelMode(1.0, "initials", 0.3, 0.6, 0.05)).toBe("full");
  });

  it("returns truncated between thresholds", () => {
    expect(selectLabelMode(0.45, "full", 0.3, 0.6, 0.05)).toBe("truncated");
  });

  it("hysteresis keeps initials mode slightly above threshold", () => {
    // prevMode=initials, zoom slightly above initialsZoom but within hyst
    expect(selectLabelMode(0.32, "initials", 0.3, 0.6, 0.05)).toBe("initials");
  });

  it("hysteresis keeps full mode slightly below threshold", () => {
    // prevMode=full, zoom slightly below truncateZoom but within hyst
    expect(selectLabelMode(0.57, "full", 0.3, 0.6, 0.05)).toBe("full");
  });

  it("transitions from initials to truncated when clearly above threshold", () => {
    expect(selectLabelMode(0.5, "initials", 0.3, 0.6, 0.05)).toBe("truncated");
  });

  it("transitions from full to truncated when clearly below threshold", () => {
    expect(selectLabelMode(0.4, "full", 0.3, 0.6, 0.05)).toBe("truncated");
  });

  it("handles zero hysteresis", () => {
    expect(selectLabelMode(0.29, "initials", 0.3, 0.6, 0)).toBe("initials");
    expect(selectLabelMode(0.31, "initials", 0.3, 0.6, 0)).toBe("truncated");
  });
});

// ---------------------------------------------------------------------------
// estimateTextWidth — character-count heuristic
// ---------------------------------------------------------------------------
describe("estimateTextWidth boundary", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTextWidth("", 12, false)).toBe(0);
  });

  it("scales linearly with text length", () => {
    const w5 = estimateTextWidth("hello", 12, false);
    const w10 = estimateTextWidth("helloworld", 12, false);
    expect(w10).toBeCloseTo(w5 * 2, -1);
  });

  it("scales linearly with font size", () => {
    const small = estimateTextWidth("test", 10, false);
    const large = estimateTextWidth("test", 20, false);
    expect(large).toBeCloseTo(small * 2, -1);
  });

  it("bold text is wider", () => {
    const normal = estimateTextWidth("test", 12, false);
    const bold = estimateTextWidth("test", 12, true);
    expect(bold).toBeGreaterThan(normal);
  });

  it("single character produces small width", () => {
    const w = estimateTextWidth("A", 12, false);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// computeRotatedAABB — axis-aligned bounding box of rotated rectangle
// ---------------------------------------------------------------------------
describe("computeRotatedAABB boundary", () => {
  it("no rotation returns original dimensions", () => {
    const aabb = computeRotatedAABB(100, 50, 0, 0.5, 0.5, 200, 300);
    expect(aabb.w).toBeCloseTo(100, 0);
    expect(aabb.h).toBeCloseTo(50, 0);
  });

  it("90 degree rotation swaps width and height", () => {
    const aabb = computeRotatedAABB(100, 50, Math.PI / 2, 0.5, 0.5, 200, 300);
    expect(aabb.w).toBeCloseTo(50, 0);
    expect(aabb.h).toBeCloseTo(100, 0);
  });

  it("45 degree rotation makes square-ish AABB", () => {
    const aabb = computeRotatedAABB(100, 0, Math.PI / 4, 0.5, 0.5, 0, 0);
    // For thin line: w ≈ h ≈ 100 * cos(45) ≈ 70.7
    expect(aabb.w).toBeCloseTo(aabb.h, 0);
  });

  it("anchor (0,0) places AABB at position", () => {
    const aabb = computeRotatedAABB(100, 50, 0, 0, 0, 10, 20);
    expect(aabb.x).toBe(10);
    expect(aabb.y).toBe(20);
  });

  it("anchor (0.5,0.5) centers AABB around position", () => {
    const aabb = computeRotatedAABB(100, 50, 0, 0.5, 0.5, 100, 100);
    expect(aabb.x).toBe(50);
    expect(aabb.y).toBe(75);
  });

  it("zero dimensions return zero-size AABB", () => {
    const aabb = computeRotatedAABB(0, 0, 1.0, 0.5, 0.5, 50, 50);
    expect(aabb.w).toBe(0);
    expect(aabb.h).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractInitials — additional boundary cases
// ---------------------------------------------------------------------------
describe("extractInitials boundary", () => {
  it("single character returns it uppercased", () => {
    const result = extractInitials("a");
    expect(result.toUpperCase()).toBe(result);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("two characters returns them uppercased", () => {
    expect(extractInitials("ab")).toBe("AB");
  });

  it("handles empty string gracefully", () => {
    const result = extractInitials("");
    expect(typeof result).toBe("string");
  });

  it("handles group suffix removal", () => {
    expect(extractInitials("action (99)")).toBe("AC");
  });

  it("handles path with multiple segments", () => {
    const result = extractInitials("a/b/c/d");
    expect(result).toBe("CD");
  });

  it("handles underscores", () => {
    expect(extractInitials("node_type")).toBe("NT");
  });

  it("handles spaces", () => {
    expect(extractInitials("hello world")).toBe("HW");
  });

  it("handles mixed separators", () => {
    expect(extractInitials("path/to-something")).toBe("TS");
  });
});
