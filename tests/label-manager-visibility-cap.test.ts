import { describe, it, expect } from "vitest";
import {
	applyVisibilityCap,
	restorePriorityFloor,
	applyZoomOutEmphasis,
	type VisibilityCandidate,
} from "../src/views/LabelManager";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MakeOpts {
	priorityScore?: number;
	isHovered?: boolean;
	isSuper?: boolean;
	hasLabel?: boolean;
	hasTagLabel?: boolean;
	hasSubLabels?: number;
	bgAlpha?: number | null;
	bgPadX?: number | null;
	initialAlpha?: number;
	initialVisible?: boolean;
}

function makeCandidate(opts: MakeOpts = {}): VisibilityCandidate {
	const hasLabel = opts.hasLabel !== false;
	return {
		pn: {
			label: hasLabel
				? {
						visible: opts.initialVisible ?? false,
						alpha: opts.initialAlpha ?? 0,
						bgAlpha: opts.bgAlpha === undefined ? 0.5 : opts.bgAlpha,
						bgPadX: opts.bgPadX === undefined ? 6 : opts.bgPadX,
					}
				: null,
			labelWasVisible: false,
			tagLabel: opts.hasTagLabel ? { visible: true } : null,
			subLabels: opts.hasSubLabels
				? Array.from({ length: opts.hasSubLabels }, () => ({ visible: true }))
				: undefined,
			priorityScore: opts.priorityScore ?? 0,
		},
		isHovered: opts.isHovered ?? false,
		isSuper: opts.isSuper ?? false,
	};
}

// ---------------------------------------------------------------------------
// applyVisibilityCap
// ---------------------------------------------------------------------------

describe("applyVisibilityCap", () => {
	it("makes all labels visible when maxVisible is 0 (uncapped)", () => {
		const candidates = [makeCandidate(), makeCandidate(), makeCandidate()];
		const visCount = applyVisibilityCap(candidates, 0, 0.7, 1.0);
		expect(visCount).toBe(3);
		for (const c of candidates) {
			expect(c.pn.label!.visible).toBe(true);
			expect(c.pn.label!.alpha).toBe(1.0);
			expect(c.pn.labelWasVisible).toBe(true);
		}
	});

	it("hides regulars exceeding maxVisible cap", () => {
		const candidates = [makeCandidate(), makeCandidate(), makeCandidate(), makeCandidate()];
		const visCount = applyVisibilityCap(candidates, 2, 0.7, 1.0);
		expect(visCount).toBe(2);
		expect(candidates[0].pn.label!.visible).toBe(true);
		expect(candidates[1].pn.label!.visible).toBe(true);
		expect(candidates[2].pn.label!.visible).toBe(false);
		expect(candidates[3].pn.label!.visible).toBe(false);
	});

	it("super-nodes bypass the cap", () => {
		const candidates = [makeCandidate(), makeCandidate(), makeCandidate({ isSuper: true }), makeCandidate()];
		const visCount = applyVisibilityCap(candidates, 1, 0.7, 1.0);
		// 1 regular + super stays visible (super is not counted in visCount)
		expect(visCount).toBe(1);
		expect(candidates[0].pn.label!.visible).toBe(true);
		expect(candidates[2].pn.label!.visible).toBe(true); // super
		expect(candidates[3].pn.label!.visible).toBe(false); // capped
	});

	it("hovered nodes bypass the cap", () => {
		const candidates = [makeCandidate(), makeCandidate({ isHovered: true })];
		const visCount = applyVisibilityCap(candidates, 1, 0.7, 1.0);
		expect(visCount).toBe(1);
		expect(candidates[0].pn.label!.visible).toBe(true);
		expect(candidates[1].pn.label!.visible).toBe(true); // hovered bypass
	});

	it("uses max(alphaMin, baseOpacity) for visible labels", () => {
		const c1 = makeCandidate();
		const c2 = makeCandidate();
		// alphaMin=0.7, baseOpacity=0.3 → 0.7
		applyVisibilityCap([c1], 0, 0.7, 0.3);
		expect(c1.pn.label!.alpha).toBe(0.7);
		// alphaMin=0.5, baseOpacity=0.9 → 0.9
		applyVisibilityCap([c2], 0, 0.5, 0.9);
		expect(c2.pn.label!.alpha).toBe(0.9);
	});

	it("hides tagLabel and subLabels when capped", () => {
		const c = makeCandidate({ hasTagLabel: true, hasSubLabels: 3 });
		applyVisibilityCap([makeCandidate(), c], 1, 0.7, 1.0);
		expect(c.pn.label!.visible).toBe(false);
		expect(c.pn.tagLabel!.visible).toBe(false);
		for (const sl of c.pn.subLabels!) {
			expect(sl.visible).toBe(false);
		}
	});

	it("skips candidates whose label is null", () => {
		const c1 = makeCandidate({ hasLabel: false });
		const c2 = makeCandidate();
		const visCount = applyVisibilityCap([c1, c2], 0, 0.7, 1.0);
		expect(visCount).toBe(1);
		expect(c2.pn.label!.visible).toBe(true);
	});

	it("returns 0 when called with empty list", () => {
		expect(applyVisibilityCap([], 5, 0.7, 1.0)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// restorePriorityFloor
// ---------------------------------------------------------------------------

describe("restorePriorityFloor", () => {
	it("returns currentVisCount unchanged when already at floor", () => {
		const candidates = [makeCandidate({ initialVisible: true }), makeCandidate({ initialVisible: false })];
		expect(restorePriorityFloor(candidates, 1, 1, 0.7, 1.0)).toBe(1);
		// Still hidden — no restoration happened
		expect(candidates[1].pn.label!.visible).toBe(false);
	});

	it("re-enables hidden regulars from priority-desc head until floor met", () => {
		const candidates = [
			makeCandidate({ priorityScore: 100, initialVisible: false }),
			makeCandidate({ priorityScore: 50, initialVisible: false }),
			makeCandidate({ priorityScore: 25, initialVisible: false }),
		];
		const newCount = restorePriorityFloor(candidates, 2, 0, 0.7, 1.0);
		expect(newCount).toBe(2);
		expect(candidates[0].pn.label!.visible).toBe(true);
		expect(candidates[1].pn.label!.visible).toBe(true);
		expect(candidates[2].pn.label!.visible).toBe(false);
	});

	it("skips already-visible labels when scanning for restoration", () => {
		const candidates = [
			makeCandidate({ initialVisible: true }), // already visible
			makeCandidate({ initialVisible: false }),
		];
		const newCount = restorePriorityFloor(candidates, 2, 1, 0.7, 1.0);
		expect(newCount).toBe(2);
		expect(candidates[1].pn.label!.visible).toBe(true);
		expect(candidates[1].pn.labelWasVisible).toBe(true);
	});

	it("skips super-nodes and hovered nodes during restoration", () => {
		const candidates = [
			makeCandidate({ isSuper: true, initialVisible: false }),
			makeCandidate({ isHovered: true, initialVisible: false }),
			makeCandidate({ initialVisible: false }),
		];
		const newCount = restorePriorityFloor(candidates, 1, 0, 0.7, 1.0);
		expect(newCount).toBe(1);
		// Super and hovered are skipped — only regular (index 2) was restored
		expect(candidates[0].pn.label!.visible).toBe(false);
		expect(candidates[1].pn.label!.visible).toBe(false);
		expect(candidates[2].pn.label!.visible).toBe(true);
	});

	it("uses max(alphaMin, baseOpacity) for restored labels", () => {
		const c = makeCandidate({ initialVisible: false });
		restorePriorityFloor([c], 1, 0, 0.7, 0.4);
		expect(c.pn.label!.alpha).toBe(0.7);
	});

	it("stops once floor is met (does not over-restore)", () => {
		const candidates = [
			makeCandidate({ initialVisible: false }),
			makeCandidate({ initialVisible: false }),
			makeCandidate({ initialVisible: false }),
		];
		const newCount = restorePriorityFloor(candidates, 1, 0, 0.7, 1.0);
		expect(newCount).toBe(1);
		expect(candidates[0].pn.label!.visible).toBe(true);
		expect(candidates[1].pn.label!.visible).toBe(false);
		expect(candidates[2].pn.label!.visible).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// applyZoomOutEmphasis
// ---------------------------------------------------------------------------

describe("applyZoomOutEmphasis", () => {
	it("boosts bgAlpha for visible labels at low zoom", () => {
		const c = makeCandidate({ initialVisible: true, bgAlpha: 0.5 });
		applyZoomOutEmphasis([c], 0.2);
		// emphasisBoost = min(0.3, (0.5 - 0.2) * 0.6) = min(0.3, 0.18) = 0.18
		expect(c.pn.label!.bgAlpha).toBeCloseTo(0.68, 4);
	});

	it("clamps bgAlpha boost at 1.0", () => {
		const c = makeCandidate({ initialVisible: true, bgAlpha: 0.95 });
		applyZoomOutEmphasis([c], 0.0); // boost = min(0.3, 0.3) = 0.3
		expect(c.pn.label!.bgAlpha).toBe(1.0);
	});

	it("clamps emphasisBoost at 0.3", () => {
		const c1 = makeCandidate({ initialVisible: true, bgAlpha: 0.0 });
		applyZoomOutEmphasis([c1], -1.0); // raw boost would be 0.9, clamped to 0.3
		expect(c1.pn.label!.bgAlpha).toBeCloseTo(0.3, 4);
	});

	it("widens bgPadX for visible labels", () => {
		const c = makeCandidate({ initialVisible: true, bgPadX: 6 });
		applyZoomOutEmphasis([c], 0.0); // boost=0.3 → padXMin = 4 + 3 = 7
		expect(c.pn.label!.bgPadX).toBe(7);
	});

	it("preserves bgPadX when already wider than computed minimum", () => {
		const c = makeCandidate({ initialVisible: true, bgPadX: 20 });
		applyZoomOutEmphasis([c], 0.0);
		expect(c.pn.label!.bgPadX).toBe(20);
	});

	it("skips invisible labels", () => {
		const c = makeCandidate({ initialVisible: false, bgAlpha: 0.5, bgPadX: 6 });
		applyZoomOutEmphasis([c], 0.0);
		expect(c.pn.label!.bgAlpha).toBe(0.5);
		expect(c.pn.label!.bgPadX).toBe(6);
	});

	it("skips candidates whose label is null", () => {
		const c = makeCandidate({ hasLabel: false });
		expect(() => applyZoomOutEmphasis([c], 0.0)).not.toThrow();
	});

	it("leaves bgAlpha untouched when null/undefined", () => {
		const c = makeCandidate({ initialVisible: true, bgAlpha: null, bgPadX: null });
		applyZoomOutEmphasis([c], 0.0);
		expect(c.pn.label!.bgAlpha).toBeNull();
		expect(c.pn.label!.bgPadX).toBeNull();
	});
});
