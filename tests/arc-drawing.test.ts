import { describe, it, expect } from "vitest";
import { drawArcLine, drawArcPath, createSunburstArcLabel } from "../src/views/arc-drawing";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import type { SunburstArcEnriched } from "../src/layouts/sunburst";

describe("drawArcLine", () => {
	it("traces arc points via moveTo then lineTo", () => {
		const gfx = new CanvasGraphics();
		drawArcLine(gfx, 0, 0, 100, 0, Math.PI);
		// Should have generated multiple commands (moveTo + lineTo * steps)
		expect(gfx.commandCount).toBeGreaterThan(10);
	});

	it("produces more steps for larger arcs", () => {
		const gfxSmall = new CanvasGraphics();
		drawArcLine(gfxSmall, 0, 0, 100, 0, Math.PI / 8);

		const gfxLarge = new CanvasGraphics();
		drawArcLine(gfxLarge, 0, 0, 100, 0, Math.PI * 2);

		expect(gfxLarge.commandCount).toBeGreaterThan(gfxSmall.commandCount);
	});

	it("handles zero-length arc (startAngle === endAngle)", () => {
		const gfx = new CanvasGraphics();
		drawArcLine(gfx, 0, 0, 50, 1.0, 1.0);
		// Minimum 16 steps → 17 commands (1 moveTo + 16 lineTo)
		expect(gfx.commandCount).toBeGreaterThanOrEqual(17);
	});
});

describe("drawArcPath", () => {
	it("traces outer arc, inner arc (reversed), and closePath", () => {
		const gfx = new CanvasGraphics();
		drawArcPath(gfx, 0, 0, 50, 100, 0, Math.PI / 2);
		// Outer arc (moveTo + lineTo*steps) + inner arc (lineTo*steps+1) + closePath
		expect(gfx.commandCount).toBeGreaterThan(20);
	});

	it("creates a closed path (annular sector)", () => {
		const gfx = new CanvasGraphics();
		drawArcPath(gfx, 100, 200, 30, 60, 0, Math.PI);
		// Verify closePath was called by checking command count is substantial
		expect(gfx.commandCount).toBeGreaterThan(30);
	});
});

describe("createSunburstArcLabel", () => {
	function makeArc(overrides: Partial<SunburstArcEnriched> = {}): SunburstArcEnriched {
		return {
			name: "test",
			depth: 1,
			x0: 0,
			x1: 1,
			y0: 0,
			y1: 1,
			value: 10,
			cx: 0,
			cy: 0,
			rInner: 50,
			rOuter: 100,
			startAngle: 0,
			endAngle: Math.PI / 2,
			groupKey: "folder/subfolder::extra",
			...overrides,
		};
	}

	it("positions label at midpoint of arc", () => {
		const arc = makeArc();
		const label = createSunburstArcLabel(arc, 14, 0xffffff);
		const midAngle = (arc.startAngle + arc.endAngle) / 2;
		const midR = (arc.rInner + arc.rOuter) / 2;
		expect(label.x).toBeCloseTo(arc.cx + midR * Math.cos(midAngle));
		expect(label.y).toBeCloseTo(arc.cy + midR * Math.sin(midAngle));
	});

	it("extracts display name from groupKey (strips :: suffix and takes last segment)", () => {
		const label = createSunburstArcLabel(makeArc({ groupKey: "a/b/display::rest" }), 14, 0xffffff);
		expect(label.text).toBe("display");
	});

	it("uses groupKey as fallback when split produces empty", () => {
		const label = createSunburstArcLabel(makeArc({ groupKey: "simpleKey" }), 14, 0xffffff);
		expect(label.text).toBe("simpleKey");
	});

	it("uses larger font and bold for depth 0 (root)", () => {
		const root = createSunburstArcLabel(makeArc({ depth: 0 }), 14, 0xffffff);
		const child = createSunburstArcLabel(makeArc({ depth: 1 }), 14, 0xffffff);
		expect(root.style.fontSize).toBeGreaterThan(child.style.fontSize as number);
		expect(root.style.fontWeight).toBe("bold");
		expect(root.strokeWidth).toBe(3);
	});

	it("uses thinner stroke for non-root depth", () => {
		const label = createSunburstArcLabel(makeArc({ depth: 2 }), 14, 0xffffff);
		expect(label.strokeWidth).toBe(2);
	});

	it("flips rotation for labels in lower half to keep text readable", () => {
		// midAngle = PI/2 → rotation = PI (which is in (PI/2, 3PI/2)) → flipped
		const arc = makeArc({ startAngle: Math.PI * 0.4, endAngle: Math.PI * 0.6 });
		const label = createSunburstArcLabel(arc, 14, 0xffffff);
		const midAngle = (arc.startAngle + arc.endAngle) / 2;
		const baseRotation = midAngle + Math.PI / 2;
		expect(label.rotation).toBeCloseTo(baseRotation + Math.PI);
	});

	it("does not flip rotation for labels in upper half", () => {
		const arc = makeArc({ startAngle: -0.2, endAngle: 0.2 });
		const label = createSunburstArcLabel(arc, 14, 0xffffff);
		const midAngle = (arc.startAngle + arc.endAngle) / 2;
		expect(label.rotation).toBeCloseTo(midAngle + Math.PI / 2);
	});
});
