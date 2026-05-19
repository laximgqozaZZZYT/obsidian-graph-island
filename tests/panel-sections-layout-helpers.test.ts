/**
 * Tests for src/views/panel-sections-layout-helpers.ts
 *
 * Each helper builds UI controls by calling addToggle / addSlider / addSelect
 * from panel-widgets.  We mock those at the module level, then within each
 * test we capture the callbacks that were passed and invoke them with test
 * values to verify that panel state is updated correctly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PanelState, PanelCallbacks } from "../src/views/PanelBuilder";
import type { ClusterSectionCtx } from "../src/views/panel-sections-layout";
import {
	addAutoFitToggle,
	addCustomGridControls,
	addAxisTitlesToggle,
	addClusterGravitySliders,
} from "../src/views/panel-sections-layout-helpers";
import { ARRANGEMENT_TIMELINE } from "../src/constants";

// ---------------------------------------------------------------------------
// Mock panel-widgets and i18n before any imports resolve.
// ---------------------------------------------------------------------------
vi.mock("../src/views/panel-widgets", () => ({
	addToggle: vi.fn(),
	addSelect: vi.fn(),
	addSlider: vi.fn(),
}));
vi.mock("../src/i18n", () => ({ t: (k: string) => k }));
vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

// Import the (now-mocked) widget builders so we can inspect their calls.
import { addToggle, addSelect, addSlider } from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePanel(overrides: Partial<PanelState> = {}): PanelState {
	return {
		autoFit: false,
		presetZoomLevel: 0,
		coordinateLayout: null,
		gridStyle: "lines",
		gridCellShading: false,
		gridShowHeaders: false,
		gridLabelPlacement: "on-line",
		showAxisTitles: false,
		clusterArrangement: "grid",
		groupBy: "none",
		clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		...overrides,
	} as unknown as PanelState;
}

function makeCb(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		applyClusterForce: vi.fn(),
		rebuildPanel: vi.fn(),
		restartSimulation: vi.fn(),
	} as unknown as PanelCallbacks;
}

function makeCtx(overrides: Partial<PanelState> = {}, spacingSliders: HTMLElement[] = []): ClusterSectionCtx {
	const panel = makePanel(overrides);
	const cb = makeCb();
	return { body: {} as HTMLElement, panel, cb, ctx: {} as any, spacingSliders };
}

/** Return the callback that was passed as the Nth positional argument to the last call of a mock. */
function lastCb(mock: ReturnType<typeof vi.fn>, argIndex: number): (...args: any[]) => void {
	const calls = (mock as any).mock.calls;
	return calls[calls.length - 1][argIndex];
}

// ---------------------------------------------------------------------------
// addAutoFitToggle
// ---------------------------------------------------------------------------

describe("addAutoFitToggle", () => {
	beforeEach(() => vi.clearAllMocks());

	it("registers a toggle with the current autoFit value", () => {
		const s = makeCtx({ autoFit: true });
		addAutoFitToggle(s);
		expect(vi.mocked(addToggle)).toHaveBeenCalled();
		// 3rd arg (index 2) is the current value
		const calls = vi.mocked(addToggle).mock.calls;
		expect(calls[calls.length - 1][2]).toBe(true);
	});

	it("sets panel.autoFit = true when callback fires with true", () => {
		const s = makeCtx({ autoFit: false });
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect((s.panel as any).autoFit).toBe(true);
	});

	it("resets presetZoomLevel to 0 when enabling autoFit", () => {
		const s = makeCtx({ autoFit: false, presetZoomLevel: 3 } as any);
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect((s.panel as any).presetZoomLevel).toBe(0);
	});

	it("does not reset presetZoomLevel when disabling autoFit", () => {
		const s = makeCtx({ autoFit: true, presetZoomLevel: 2 } as any);
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(false);
		expect((s.panel as any).presetZoomLevel).toBe(2);
	});

	it("calls applyClusterForce, restartSimulation(0.5), and doRenderKeepPanel", () => {
		const s = makeCtx();
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect(s.cb.applyClusterForce).toHaveBeenCalled();
		expect(s.cb.restartSimulation).toHaveBeenCalledWith(0.5);
		expect(s.cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("disables spacingSliders (opacity 0.5) when autoFit is enabled", () => {
		const slider = { style: { opacity: "", pointerEvents: "" } } as unknown as HTMLElement;
		const s = makeCtx({}, [slider]);
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect(slider.style.opacity).toBe("0.5");
		expect(slider.style.pointerEvents).toBe("none");
	});

	it("re-enables spacingSliders when autoFit is disabled", () => {
		const slider = { style: { opacity: "0.5", pointerEvents: "none" } } as unknown as HTMLElement;
		const s = makeCtx({}, [slider]);
		addAutoFitToggle(s);
		lastCb(vi.mocked(addToggle), 3)(false);
		expect(slider.style.opacity).toBe("");
		expect(slider.style.pointerEvents).toBe("");
	});
});

// ---------------------------------------------------------------------------
// addCustomGridControls
// ---------------------------------------------------------------------------

describe("addCustomGridControls", () => {
	beforeEach(() => vi.clearAllMocks());

	it("is a no-op when coordinateLayout is null", () => {
		const s = makeCtx({ coordinateLayout: null });
		addCustomGridControls(s);
		expect(vi.mocked(addToggle)).not.toHaveBeenCalled();
	});

	it("registers a table-mode toggle when coordinateLayout is set", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined } } as any);
		addCustomGridControls(s);
		expect(vi.mocked(addToggle)).toHaveBeenCalled();
	});

	it("enables the grid object when table-mode toggle fires with true", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined }, gridStyle: "lines", gridCellShading: false } as any);
		addCustomGridControls(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect((s.panel as any).coordinateLayout.grid).toBeDefined();
		expect(s.cb.applyClusterForce).toHaveBeenCalled();
		expect(s.cb.restartSimulation).toHaveBeenCalledWith(0.3);
		expect(s.cb.rebuildPanel).toHaveBeenCalled();
	});

	it("clears the grid object when table-mode toggle fires with false", () => {
		const s = makeCtx({ coordinateLayout: { grid: { style: "lines", cellShading: false } } } as any);
		addCustomGridControls(s);
		// Multiple toggles are registered when grid is active; the first is the table-mode toggle.
		const firstToggleCb = vi.mocked(addToggle).mock.calls[0][3];
		firstToggleCb(false);
		expect((s.panel as any).coordinateLayout.grid).toBeUndefined();
	});

	it("does not register a grid-style select when grid is not active (hasGrid === false)", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined } } as any);
		addCustomGridControls(s);
		expect(vi.mocked(addSelect)).not.toHaveBeenCalled();
	});

	it("registers a grid-style select when grid is active", () => {
		const s = makeCtx({ coordinateLayout: { grid: { style: "lines", cellShading: false } }, gridStyle: "lines" } as any);
		addCustomGridControls(s);
		expect(vi.mocked(addSelect)).toHaveBeenCalled();
	});

	it("updates gridStyle and grid.style when grid-style select fires", () => {
		const s = makeCtx({
			coordinateLayout: { grid: { style: "lines", cellShading: false } },
			gridStyle: "lines",
		} as any);
		addCustomGridControls(s);
		// First addSelect call is for grid-style.
		const cb = vi.mocked(addSelect).mock.calls[0][4];
		cb("table");
		expect((s.panel as any).gridStyle).toBe("table");
		expect((s.panel as any).coordinateLayout.grid.style).toBe("table");
		expect(s.cb.doRenderKeepPanel).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addAxisTitlesToggle
// ---------------------------------------------------------------------------

describe("addAxisTitlesToggle", () => {
	beforeEach(() => vi.clearAllMocks());

	it("is a no-op when coordinateLayout is null and arrangement is not timeline", () => {
		const s = makeCtx({ coordinateLayout: null, clusterArrangement: "grid" });
		addAxisTitlesToggle(s);
		expect(vi.mocked(addToggle)).not.toHaveBeenCalled();
	});

	it("registers a toggle when coordinateLayout is present", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined } } as any);
		addAxisTitlesToggle(s);
		expect(vi.mocked(addToggle)).toHaveBeenCalled();
	});

	it("registers a toggle when clusterArrangement is ARRANGEMENT_TIMELINE", () => {
		const s = makeCtx({ coordinateLayout: null, clusterArrangement: ARRANGEMENT_TIMELINE } as any);
		addAxisTitlesToggle(s);
		expect(vi.mocked(addToggle)).toHaveBeenCalled();
	});

	it("reflects current showAxisTitles value in the toggle registration", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined }, showAxisTitles: true } as any);
		addAxisTitlesToggle(s);
		const calls = vi.mocked(addToggle).mock.calls;
		expect(calls[calls.length - 1][2]).toBe(true);
	});

	it("sets showAxisTitles and calls markDirty when toggle fires", () => {
		const s = makeCtx({ coordinateLayout: { grid: undefined }, showAxisTitles: false } as any);
		addAxisTitlesToggle(s);
		lastCb(vi.mocked(addToggle), 3)(true);
		expect((s.panel as any).showAxisTitles).toBe(true);
		expect(s.cb.markDirty).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addClusterGravitySliders
// ---------------------------------------------------------------------------

describe("addClusterGravitySliders", () => {
	const debouncedClusterForce = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		debouncedClusterForce.mockClear();
	});

	it("is a no-op when groupBy is 'none'", () => {
		const s = makeCtx({ groupBy: "none" });
		addClusterGravitySliders(s, debouncedClusterForce);
		expect(vi.mocked(addSlider)).not.toHaveBeenCalled();
	});

	it("is a no-op when groupBy is undefined", () => {
		const s = makeCtx({ groupBy: undefined } as any);
		addClusterGravitySliders(s, debouncedClusterForce);
		expect(vi.mocked(addSlider)).not.toHaveBeenCalled();
	});

	it("registers two sliders when groupBy is an active value", () => {
		const s = makeCtx({
			groupBy: "tags",
			clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		} as any);
		addClusterGravitySliders(s, debouncedClusterForce);
		expect(vi.mocked(addSlider)).toHaveBeenCalledTimes(2);
	});

	it("initialises clusterGravity with defaults when missing", () => {
		const s = makeCtx({ groupBy: "category", clusterGravity: undefined } as any);
		addClusterGravitySliders(s, debouncedClusterForce);
		expect((s.panel as any).clusterGravity).toEqual({
			interGroupAttraction: 0.5,
			intraGroupDensity: 1.0,
		});
	});

	it("first slider callback updates interGroupAttraction and calls debouncedClusterForce", () => {
		const s = makeCtx({
			groupBy: "tags",
			clusterGravity: { interGroupAttraction: 0.8, intraGroupDensity: 1.5 },
		} as any);
		addClusterGravitySliders(s, debouncedClusterForce);
		const firstCb = vi.mocked(addSlider).mock.calls[0][6];
		firstCb(1.2);
		expect((s.panel as any).clusterGravity.interGroupAttraction).toBe(1.2);
		expect(debouncedClusterForce).toHaveBeenCalled();
	});

	it("second slider callback updates intraGroupDensity and calls debouncedClusterForce", () => {
		const s = makeCtx({
			groupBy: "tags",
			clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		} as any);
		addClusterGravitySliders(s, debouncedClusterForce);
		const secondCb = vi.mocked(addSlider).mock.calls[1][6];
		secondCb(2.5);
		expect((s.panel as any).clusterGravity.intraGroupDensity).toBe(2.5);
		expect(debouncedClusterForce).toHaveBeenCalled();
	});
});
