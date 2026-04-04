import { describe, it, expect } from "vitest";
import {
	labelModeChar,
	buildLabelInfo,
	modeDescription,
	buildZoomTooltip,
	parseCulledCount,
	buildZoomA11yMessage,
} from "../src/views/zoom-indicator";

describe("labelModeChar", () => {
	it("returns I for initials override", () => {
		expect(labelModeChar(0.5, "initials", 0.3, 0.6)).toBe("I");
	});
	it("returns T for truncated override", () => {
		expect(labelModeChar(0.5, "truncated", 0.3, 0.6)).toBe("T");
	});
	it("returns F for full override", () => {
		expect(labelModeChar(0.5, "full", 0.3, 0.6)).toBe("F");
	});
	it("returns I when auto and scale < initialsZoom", () => {
		expect(labelModeChar(0.2, "auto", 0.3, 0.6)).toBe("I");
	});
	it("returns T when auto and initialsZoom <= scale < truncateZoom", () => {
		expect(labelModeChar(0.4, "auto", 0.3, 0.6)).toBe("T");
	});
	it("returns F when auto and scale >= truncateZoom", () => {
		expect(labelModeChar(0.7, "auto", 0.3, 0.6)).toBe("F");
	});
	it("returns I at exact initialsZoom boundary (not below)", () => {
		expect(labelModeChar(0.3, "auto", 0.3, 0.6)).toBe("T");
	});
});

describe("buildLabelInfo", () => {
	it("formats visible count and mode char", () => {
		expect(buildLabelInfo(42, "T")).toBe(" · 42L·T");
	});
	it("works with zero visible", () => {
		expect(buildLabelInfo(0, "I")).toBe(" · 0L·I");
	});
});

describe("modeDescription", () => {
	it("returns initials description for I", () => {
		expect(modeDescription("I")).toBe("Initials mode (2 chars)");
	});
	it("returns truncated description for T", () => {
		expect(modeDescription("T")).toBe("Truncated mode (5-12 chars)");
	});
	it("returns full description for F", () => {
		expect(modeDescription("F")).toBe("Full name mode");
	});
	it("returns empty string for unknown", () => {
		expect(modeDescription("X")).toBe("");
	});
});

describe("buildZoomTooltip", () => {
	it("includes mode description when provided", () => {
		const tip = buildZoomTooltip("Full name mode");
		expect(tip).toContain("Label: Full name mode");
		expect(tip).toContain("Click to reset to 100%");
	});
	it("omits label line when description is empty", () => {
		const tip = buildZoomTooltip("");
		expect(tip).not.toContain("Label:");
		expect(tip).toContain("Keys: 0-9 for zoom");
	});
});

describe("parseCulledCount", () => {
	it("returns 0 when badge is not visible", () => {
		expect(parseCulledCount(false, "+50 culled")).toBe(0);
	});
	it("parses count from badge text", () => {
		expect(parseCulledCount(true, "+123 culled")).toBe(123);
	});
	it("returns 0 when text has no match", () => {
		expect(parseCulledCount(true, "no number")).toBe(0);
	});
	it("returns 0 for null text", () => {
		expect(parseCulledCount(true, null)).toBe(0);
	});
});

describe("buildZoomA11yMessage", () => {
	it("builds basic zoom message", () => {
		expect(buildZoomA11yMessage("150%", "", 0)).toBe("Zoom: 150%");
	});
	it("includes label info when present", () => {
		expect(buildZoomA11yMessage("50%", " · 10L·T", 0)).toBe("Zoom: 50%, · 10L·T labels visible");
	});
	it("includes culled count when positive", () => {
		expect(buildZoomA11yMessage("80%", "", 25)).toBe("Zoom: 80%, 25 hidden");
	});
	it("includes both label info and culled count", () => {
		const msg = buildZoomA11yMessage("30%", " · 5L·I", 10);
		expect(msg).toBe("Zoom: 30%, · 5L·I labels visible, 10 hidden");
	});
});
