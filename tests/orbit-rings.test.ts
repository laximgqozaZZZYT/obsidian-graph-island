import { describe, it, expect } from "vitest";
import { drawOrbitRings } from "../src/views/orbit-rings";
import type { ShellInfo } from "../src/types";
import type { IGraphics } from "../src/views/canvas2d/interfaces";

// Minimal IGraphics stub that records lineStyle + drawCircle calls.
// Other IGraphics methods are no-ops; we only assert on the calls drawOrbitRings makes.
function makeRecordingGfx(): {
	gfx: IGraphics;
	lineStyles: Array<{ width: number; color: number; alpha: number }>;
	circles: Array<{ x: number; y: number; r: number }>;
} {
	const lineStyles: Array<{ width: number; color: number; alpha: number }> = [];
	const circles: Array<{ x: number; y: number; r: number }> = [];
	const gfx = {
		x: 0,
		y: 0,
		alpha: 1,
		visible: true,
		parent: null,
		commandCount: 0,
		clear: () => {},
		lineStyle: (
			widthOrObj: number | { width: number; color?: number; alpha?: number; native?: boolean },
			color?: number,
			alpha?: number,
		) => {
			if (typeof widthOrObj === "number") {
				lineStyles.push({ width: widthOrObj, color: color ?? 0, alpha: alpha ?? 1 });
			} else {
				lineStyles.push({
					width: widthOrObj.width,
					color: widthOrObj.color ?? 0,
					alpha: widthOrObj.alpha ?? 1,
				});
			}
		},
		beginFill: () => {},
		beginRadialFill: () => {},
		setLineDash: () => {},
		endFill: () => {},
		moveTo: () => {},
		lineTo: () => {},
		drawCircle: (x: number, y: number, r: number) => {
			circles.push({ x, y, r });
		},
		drawRect: () => {},
		quadraticCurveTo: () => {},
		bezierCurveTo: () => {},
		setLineCap: () => {},
		setLineJoin: () => {},
		closePath: () => {},
		arc: () => {},
		drawRoundedRect: () => {},
		destroy: () => {},
		_flush: () => {},
	} as unknown as IGraphics;
	return { gfx, lineStyles, circles };
}

function makeShell(overrides: Partial<ShellInfo> = {}): ShellInfo {
	return {
		radius: 100,
		nodeIds: [],
		centerX: 0,
		centerY: 0,
		angleOffset: 0,
		rotationSpeed: 0,
		rotationDirection: 1,
		...overrides,
	};
}

describe("drawOrbitRings", () => {
	it("does nothing when shells array is empty", () => {
		const { gfx, lineStyles, circles } = makeRecordingGfx();
		drawOrbitRings(gfx, [], true);
		expect(lineStyles).toHaveLength(0);
		expect(circles).toHaveLength(0);
	});

	it("draws one circle per shell with positive radius", () => {
		const { gfx, circles } = makeRecordingGfx();
		drawOrbitRings(
			gfx,
			[makeShell({ radius: 50 }), makeShell({ radius: 100 }), makeShell({ radius: 150 })],
			true,
		);
		expect(circles).toHaveLength(3);
		expect(circles[0].r).toBe(50);
		expect(circles[2].r).toBe(150);
	});

	it("skips shells with non-positive radius", () => {
		const { gfx, circles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell({ radius: 0 }), makeShell({ radius: -5 }), makeShell({ radius: 100 })], false);
		expect(circles).toHaveLength(1);
		expect(circles[0].r).toBe(100);
	});

	it("uses dark ring color when isDark=true", () => {
		const { gfx, lineStyles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell()], true);
		expect(lineStyles[0].color).toBe(0x888888);
	});

	it("uses light ring color when isDark=false", () => {
		const { gfx, lineStyles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell()], false);
		expect(lineStyles[0].color).toBe(0xaaaaaa);
	});

	it("uses inner alpha and width for single shell", () => {
		const { gfx, lineStyles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell()], true);
		// Single shell → t=0 → alpha=0.3, width=1.5
		expect(lineStyles[0].alpha).toBeCloseTo(0.3, 5);
		expect(lineStyles[0].width).toBeCloseTo(1.5, 5);
	});

	it("fades alpha and width from inner to outer across multiple shells", () => {
		const { gfx, lineStyles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell({ radius: 50 }), makeShell({ radius: 100 }), makeShell({ radius: 150 })], true);
		// i=0 → t=0 → alpha=0.30, width=1.5
		// i=1 → t=0.5 → alpha=0.225, width=1.25
		// i=2 → t=1.0 → alpha=0.15, width=1.0
		expect(lineStyles[0].alpha).toBeCloseTo(0.3, 5);
		expect(lineStyles[1].alpha).toBeCloseTo(0.225, 5);
		expect(lineStyles[2].alpha).toBeCloseTo(0.15, 5);
		expect(lineStyles[0].width).toBeCloseTo(1.5, 5);
		expect(lineStyles[1].width).toBeCloseTo(1.25, 5);
		expect(lineStyles[2].width).toBeCloseTo(1.0, 5);
	});

	it("preserves shell center coordinates", () => {
		const { gfx, circles } = makeRecordingGfx();
		drawOrbitRings(gfx, [makeShell({ centerX: 100, centerY: -50, radius: 25 })], true);
		expect(circles[0]).toEqual({ x: 100, y: -50, r: 25 });
	});
});
