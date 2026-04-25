/**
 * LabelManager — zoom-aware diversity guarantee
 *
 * Verifies _promoteDiversityNodes (observed via applyTextFade) uses
 *   - labelMinNonSuperZoomedOut (default 20) when zoom < labelZoomedOutThreshold (0.2)
 *   - labelMinNonSuper as before when zoom >= threshold (regression guard)
 *   - the labelMinNonSuperZoomedOut override value when supplied via thresholds
 */
import { describe, it, expect, vi } from "vitest";
import { LabelManager, type LabelManagerHost } from "../src/views/LabelManager";
import type { PixiNode } from "../src/views/InteractionManager";
import type { CanvasText } from "../src/views/canvas2d";
import type { RenderThresholds } from "../src/types";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockCanvasText(text: string): CanvasText {
	return {
		text,
		visible: true,
		x: 0,
		y: 0,
		rotation: 0,
		anchor: { x: 0.5, y: 0 },
		width: text.length * 8,
		height: 14,
		style: { fontSize: 14 },
		scale: { x: 1, y: 1, set: vi.fn() },
		alpha: 1,
	} as any;
}

interface MockNodeOptions {
	id: string;
	isSuper?: boolean;
	degree?: number;
	minShowZoom?: number;
}

function createMockPixiNode(opts: MockNodeOptions): PixiNode {
	const { id, isSuper = false, minShowZoom = 0.6 } = opts;
	return {
		data: {
			id,
			label: id,
			collapsedMembers: isSuper ? [`${id}-member`] : undefined,
		},
		label: createMockCanvasText(id),
		// >0 so _computePriorityScores skips and minShowZoom is preserved
		priorityScore: 50,
		minShowZoom,
		labelWasVisible: false,
		radius: 12,
		tagLabel: undefined,
		subLabels: undefined,
	} as any;
}

interface ScenarioOptions {
	nonSuperCount: number;
	superCount: number;
	zoom: number;
	thresholds?: Partial<RenderThresholds>;
	/** minShowZoom assigned to non-super nodes — must exceed zoom to make them
	 *  ineligible by LOD so the diversity guarantee path is exercised. */
	nonSuperMinShowZoom?: number;
}

function runScenario(opts: ScenarioOptions): { nodes: Map<string, PixiNode> } {
	const nodes = new Map<string, PixiNode>();
	const degrees = new Map<string, number>();

	// Insert non-super FIRST so pixiArr[0] is non-super with priorityScore>0,
	// causing _computePriorityScores to short-circuit and preserve minShowZoom.
	for (let i = 0; i < opts.nonSuperCount; i++) {
		const id = `n${i}`;
		nodes.set(id, createMockPixiNode({ id, minShowZoom: opts.nonSuperMinShowZoom ?? 0.6 }));
		// Distinct degrees so promotion ordering is deterministic
		degrees.set(id, opts.nonSuperCount - i);
	}
	for (let i = 0; i < opts.superCount; i++) {
		const id = `s${i}`;
		nodes.set(id, createMockPixiNode({ id, isSuper: true, minShowZoom: 0.001 }));
		degrees.set(id, 100 + i);
	}

	const host: LabelManagerHost = {
		getPixiNodes: vi.fn(() => nodes),
		getDegrees: vi.fn(() => degrees),
		getTextFadeThreshold: vi.fn(() => 0),
		getRenderThresholds: vi.fn(() => opts.thresholds ?? {}),
		getWorldScale: vi.fn(() => opts.zoom),
		getRenderPipeline: vi.fn(() => null),
		getSunburstLabels: vi.fn(() => new Map()),
		getClusterSunburstLabels: vi.fn(() => new Map()),
		getPrevHighlightSet: vi.fn(() => new Set()),
		getSearchQuery: vi.fn(() => ""),
		markDirty: vi.fn(),
	};

	const manager = new LabelManager(host);
	manager.applyTextFade();

	return { nodes };
}

function countVisibleNonSuper(nodes: Map<string, PixiNode>): number {
	let count = 0;
	for (const pn of nodes.values()) {
		const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		if (isSuper) continue;
		if (pn.label?.visible) count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LabelManager — zoom-aware diversity guarantee", () => {
	it("promotes ≥20 non-super labels at zoom=0.087 with 200 nodes (195 non-super + 5 super) using default labelMinNonSuperZoomedOut", () => {
		const { nodes } = runScenario({
			nonSuperCount: 195,
			superCount: 5,
			zoom: 0.087,
			// Use defaults (labelMinNonSuperZoomedOut=20, labelZoomedOutThreshold=0.2)
		});

		const visibleNonSuper = countVisibleNonSuper(nodes);
		// Default labelMinNonSuperZoomedOut is 20 and zoom (0.087) < threshold (0.2),
		// so the guarantee kicks in even though no non-super passes LOD initially.
		expect(visibleNonSuper).toBeGreaterThanOrEqual(20);
	});

	it("uses labelMinNonSuper (5) when zoom (0.5) exceeds labelZoomedOutThreshold (0.2) — regression guard", () => {
		const { nodes } = runScenario({
			nonSuperCount: 195,
			superCount: 5,
			zoom: 0.5,
			thresholds: {
				labelMinNonSuper: 5,
				// Default labelMinNonSuperZoomedOut=20 — must NOT be applied at this zoom
			},
			// minShowZoom > 0.5 so all non-super are LOD-ineligible, isolating the
			// promotion path
			nonSuperMinShowZoom: 0.6,
		});

		const visibleNonSuper = countVisibleNonSuper(nodes);
		// At zoom 0.5 (> 0.2), the non-zoomed-out branch is taken: labelMinNonSuper=5
		// governs target. 5 (not 20) non-super get promoted.
		expect(visibleNonSuper).toBe(5);
	});

	it("honors labelMinNonSuperZoomedOut override (30) at zoom-out", () => {
		const { nodes } = runScenario({
			nonSuperCount: 195,
			superCount: 5,
			zoom: 0.087,
			thresholds: {
				labelMinNonSuperZoomedOut: 30,
			},
		});

		const visibleNonSuper = countVisibleNonSuper(nodes);
		// Override of 30 takes effect because zoom (0.087) < threshold (0.2)
		expect(visibleNonSuper).toBe(30);
	});
});
