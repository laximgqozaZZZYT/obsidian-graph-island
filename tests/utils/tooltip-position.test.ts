import { describe, it, expect } from "vitest";
import {
	tooltipNeedsFlip,
	computeFlippedOffset,
	adjustTooltipPosition,
	type TooltipAdjustInput,
} from "../../src/utils/tooltip-position";

/* ---------- helpers ---------- */

function baseInput(overrides: Partial<TooltipAdjustInput> = {}): TooltipAdjustInput {
	return {
		nodeX: 100,
		nodeY: 100,
		nodeRadius: 10,
		tipOffsetX: 20,
		tipOffsetY: -12,
		tipWidth: 100,
		tipHeight: 30,
		worldScale: 1,
		worldX: 0,
		worldY: 0,
		gfxScale: 1,
		counterScale: 1,
		canvasWidth: 800,
		canvasHeight: 600,
		panelRects: [],
		isCard: false,
		cardAspectRatio: 1.618,
		...overrides,
	};
}

/* ---------- tooltipNeedsFlip ---------- */

describe("tooltipNeedsFlip", () => {
	it("returns false when tooltip is fully inside canvas with no panels", () => {
		expect(tooltipNeedsFlip(10, 10, 50, 20, 800, 600, [])).toBe(false);
	});

	it("returns true when tooltip overflows right edge", () => {
		expect(tooltipNeedsFlip(750, 10, 100, 20, 800, 600, [])).toBe(true);
	});

	it("returns true when tooltip overflows bottom edge", () => {
		expect(tooltipNeedsFlip(10, 590, 50, 20, 800, 600, [])).toBe(true);
	});

	it("returns true when tooltip overlaps a panel", () => {
		const panels = [{ x: 700, y: 0, w: 100, h: 600 }];
		// Tooltip at (690, 10) with w=50 overlaps panel starting at x=700
		expect(tooltipNeedsFlip(690, 10, 50, 20, 800, 600, panels)).toBe(true);
	});

	it("returns false when tooltip does not overlap any panel", () => {
		const panels = [{ x: 700, y: 0, w: 100, h: 600 }];
		expect(tooltipNeedsFlip(10, 10, 50, 20, 800, 600, panels)).toBe(false);
	});

	it("returns false when tooltip is exactly at canvas edge (no overflow)", () => {
		// tipScrX + tipW === canvasWidth → NOT overflow (strictly >)
		expect(tooltipNeedsFlip(700, 500, 100, 100, 800, 600, [])).toBe(false);
	});

	it("detects overlap with second panel only", () => {
		const panels = [
			{ x: 0, y: 0, w: 50, h: 50 },
			{ x: 100, y: 100, w: 200, h: 200 },
		];
		expect(tooltipNeedsFlip(150, 150, 60, 30, 800, 600, panels)).toBe(true);
	});
});

/* ---------- computeFlippedOffset ---------- */

describe("computeFlippedOffset", () => {
	it("flips tooltip to left of node in normal mode", () => {
		const input = baseInput({ nodeX: 500 });
		const result = computeFlippedOffset(input, 50);
		// flipOffset = radius + 4 + estW = 10 + 4 + 100 = 114
		expect(result.x).toBeCloseTo(-114);
	});

	it("uses card-aware offset in card mode", () => {
		const input = baseInput({ isCard: true, nodeRadius: 20, cardAspectRatio: 2.0, nodeX: 500 });
		const result = computeFlippedOffset(input, 50);
		// cardHW = max(40, (40*2)/2) = max(40, 40) = 40
		// flipOffset = 40 + 8 + 100 = 148
		expect(result.x).toBeCloseTo(-148);
	});

	it("places below node when left flip overflows left edge", () => {
		// Node near left edge so flipping left goes off-screen
		const input = baseInput({ nodeX: 10, worldScale: 1, worldX: 0 });
		const result = computeFlippedOffset(input, 50);
		// flippedScrX = (10 + (-114) * 1) * 1 + 0 = -104 < 0
		expect(result.x).toBe(0);
		expect(result.y).toBe(14); // (10 + 4) * 1
	});

	it("pushes down when original tipScrY is negative", () => {
		const input = baseInput({ nodeRadius: 20 });
		const result = computeFlippedOffset(input, -50);
		// tipScrY < 0 → y = (20*0.4 + 2) * 1 = 10
		expect(result.y).toBeCloseTo(10);
	});

	it("respects gfxScale in flip offset", () => {
		const input = baseInput({ gfxScale: 2, nodeX: 500 });
		const result = computeFlippedOffset(input, 50);
		// flipOffset = 10 + 4 + 100 = 114, x = -114 * 2 = -228
		expect(result.x).toBeCloseTo(-228);
	});
});

/* ---------- adjustTooltipPosition ---------- */

describe("adjustTooltipPosition", () => {
	it("returns null when no overlap detected", () => {
		const input = baseInput();
		expect(adjustTooltipPosition(input)).toBeNull();
	});

	it("returns flipped position when tooltip overflows right edge", () => {
		const input = baseInput({
			nodeX: 700,
			tipOffsetX: 20,
			tipWidth: 150,
			canvasWidth: 800,
		});
		// tipScrX = (700 + 20) * 1 + 0 = 720, tipW = 150 → 720+150=870 > 800
		const result = adjustTooltipPosition(input);
		expect(result).not.toBeNull();
		expect(result!.x).toBeLessThan(0);
	});

	it("returns flipped position when tooltip overlaps panel", () => {
		const input = baseInput({
			nodeX: 500,
			tipOffsetX: 20,
			tipWidth: 100,
			panelRects: [{ x: 510, y: 0, w: 200, h: 600 }],
		});
		const result = adjustTooltipPosition(input);
		expect(result).not.toBeNull();
	});

	it("accounts for worldScale in screen position calculation", () => {
		const input = baseInput({
			nodeX: 400,
			tipOffsetX: 10,
			tipWidth: 80,
			worldScale: 2,
			canvasWidth: 800,
		});
		// tipScrX = (400 + 10) * 2 + 0 = 820, tipW = 80 * 1 * 2 = 160 → 820+160=980 > 800
		const result = adjustTooltipPosition(input);
		expect(result).not.toBeNull();
	});

	it("returns null for tooltip safely inside viewport", () => {
		const input = baseInput({
			nodeX: 200,
			nodeY: 200,
			tipOffsetX: 15,
			tipOffsetY: -10,
			tipWidth: 80,
			tipHeight: 25,
		});
		expect(adjustTooltipPosition(input)).toBeNull();
	});
});
