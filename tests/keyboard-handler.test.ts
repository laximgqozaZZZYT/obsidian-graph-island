import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({ TFile: class {} }));

import { handleShortcutKey, type KeyboardHost } from "../src/views/KeyboardHandler";

// Minimal DOM stub (no jsdom required)
function stubEl(): any {
	const classList = new Set<string>();
	return {
		classList: {
			toggle: (cls: string) => {
				if (classList.has(cls)) classList.delete(cls);
				else classList.add(cls);
			},
			remove: (cls: string) => classList.delete(cls),
			contains: (cls: string) => classList.has(cls),
		},
		querySelector: () => null,
		querySelectorAll: () => [],
		appendChild: () => {},
		focus: () => {},
	};
}

function mockHost(overrides?: Partial<KeyboardHost>): KeyboardHost {
	return {
		panelEl: stubEl(),
		containerEl: stubEl(),
		worldContainer: { x: 0, y: 0 },
		highlightedNodeId: null,
		isKeyboardFocused: false,
		panel: { showLegend: false, showMinimap: false, showDotGrid: false, hoverHops: 2 },
		compareNodeIds: [],
		pixiNodes: new Map(),
		app: {} as any,
		autoFitView: vi.fn(),
		zoomBy: vi.fn(),
		setZoom: vi.fn(),
		markDirty: vi.fn(),
		applyHover: vi.fn(),
		updateLegend: vi.fn(),
		requestSave: vi.fn(),
		copyGraphToClipboard: vi.fn(),
		cycleFocusNode: vi.fn(),
		focusZoomToNode: vi.fn(),
		navigateNeighbor: vi.fn(),
		announceA11y: vi.fn(),
		announceZoomLevel: vi.fn(),
		toggleHelpOverlay: vi.fn(),
		toggleMultiSelect: vi.fn(),
		addCompareNode: vi.fn(),
		setPathfinderNode: vi.fn(),
		openFile: vi.fn(),
		...overrides,
	};
}

function makeEvent(key: string, mods?: { ctrl?: boolean; shift?: boolean; meta?: boolean }): any {
	return {
		key,
		ctrlKey: mods?.ctrl ?? false,
		shiftKey: mods?.shift ?? false,
		metaKey: mods?.meta ?? false,
		altKey: false,
		preventDefault: vi.fn(),
	};
}

describe("handleShortcutKey", () => {
	it("Space triggers autoFitView", () => {
		const wrap = { clientWidth: 800, clientHeight: 600 };
		const host = mockHost();
		(host.containerEl as any).querySelector = (sel: string) => (sel.includes("graph-svg-wrap") ? wrap : null);

		const handled = handleShortcutKey(host, " ", makeEvent(" "));
		expect(handled).toBe(true);
		expect(host.autoFitView).toHaveBeenCalledWith(800, 600);
	});

	it("L toggles legend", () => {
		const host = mockHost();
		host.panel.showLegend = false;
		handleShortcutKey(host, "l", makeEvent("l"));
		expect(host.panel.showLegend).toBe(true);
		expect(host.updateLegend).toHaveBeenCalled();
		expect(host.requestSave).toHaveBeenCalled();
	});

	it("M toggles minimap", () => {
		const host = mockHost();
		host.panel.showMinimap = false;
		handleShortcutKey(host, "m", makeEvent("m"));
		expect(host.panel.showMinimap).toBe(true);
		expect(host.markDirty).toHaveBeenCalledWith(true);
	});

	it("G toggles grid", () => {
		const host = mockHost();
		host.panel.showDotGrid = false;
		handleShortcutKey(host, "g", makeEvent("g"));
		expect(host.panel.showDotGrid).toBe(true);
	});

	it("+ zooms in", () => {
		const host = mockHost();
		handleShortcutKey(host, "+", makeEvent("+"));
		expect(host.zoomBy).toHaveBeenCalledWith(1.2);
		expect(host.announceZoomLevel).toHaveBeenCalled();
	});

	it("- zooms out", () => {
		const host = mockHost();
		handleShortcutKey(host, "-", makeEvent("-"));
		expect(host.zoomBy).toHaveBeenCalledWith(1 / 1.2);
	});

	it("[ decreases hoverHops", () => {
		const host = mockHost();
		host.panel.hoverHops = 3;
		handleShortcutKey(host, "[", makeEvent("["));
		expect(host.panel.hoverHops).toBe(2);
		expect(host.applyHover).toHaveBeenCalled();
	});

	it("] increases hoverHops", () => {
		const host = mockHost();
		host.panel.hoverHops = 3;
		handleShortcutKey(host, "]", makeEvent("]"));
		expect(host.panel.hoverHops).toBe(4);
	});

	it("[ clamps hoverHops at 0", () => {
		const host = mockHost();
		host.panel.hoverHops = 0;
		handleShortcutKey(host, "[", makeEvent("["));
		expect(host.panel.hoverHops).toBe(0);
	});

	it("] clamps hoverHops at 10", () => {
		const host = mockHost();
		host.panel.hoverHops = 10;
		handleShortcutKey(host, "]", makeEvent("]"));
		expect(host.panel.hoverHops).toBe(10);
	});

	it("Tab calls cycleFocusNode(1)", () => {
		const host = mockHost();
		handleShortcutKey(host, "Tab", makeEvent("Tab"));
		expect(host.cycleFocusNode).toHaveBeenCalledWith(1);
	});

	it("Shift+Tab calls cycleFocusNode(-1)", () => {
		const host = mockHost();
		handleShortcutKey(host, "Tab", makeEvent("Tab", { shift: true }));
		expect(host.cycleFocusNode).toHaveBeenCalledWith(-1);
	});

	it("? toggles help overlay", () => {
		const host = mockHost();
		handleShortcutKey(host, "?", makeEvent("?"));
		expect(host.toggleHelpOverlay).toHaveBeenCalled();
	});

	it("Ctrl+Shift+C copies graph", () => {
		const host = mockHost();
		handleShortcutKey(host, "C", makeEvent("C", { ctrl: true, shift: true }));
		expect(host.copyGraphToClipboard).toHaveBeenCalled();
	});

	it("Arrow keys pan when no focus", () => {
		const host = mockHost();
		handleShortcutKey(host, "ArrowUp", makeEvent("ArrowUp"));
		expect(host.worldContainer!.y).toBe(50);
		handleShortcutKey(host, "ArrowDown", makeEvent("ArrowDown"));
		expect(host.worldContainer!.y).toBe(0);
	});

	it("Arrow keys navigate neighbors when focused", () => {
		const host = mockHost({ isKeyboardFocused: true, highlightedNodeId: "node1" });
		handleShortcutKey(host, "ArrowRight", makeEvent("ArrowRight"));
		expect(host.navigateNeighbor).toHaveBeenCalledWith("ArrowRight");
	});

	it("P toggles panel visibility", () => {
		const host = mockHost();
		handleShortcutKey(host, "p", makeEvent("p"));
		// After first toggle, is-hidden should be set
		expect((host.panelEl as any).classList.contains("is-hidden")).toBe(true);
		handleShortcutKey(host, "p", makeEvent("p"));
		expect((host.panelEl as any).classList.contains("is-hidden")).toBe(false);
	});

	it("returns false for unhandled keys", () => {
		const host = mockHost();
		const result = handleShortcutKey(host, "x", makeEvent("x"));
		expect(result).toBe(false);
	});

	// --- Boundary value tests ---

	it("= also zooms in (alternative to +)", () => {
		const host = mockHost();
		const handled = handleShortcutKey(host, "=", makeEvent("="));
		expect(handled).toBe(true);
		expect(host.zoomBy).toHaveBeenCalledWith(1.2);
	});

	it("Ctrl+key modifiers block single-key shortcuts", () => {
		const host = mockHost();
		// Ctrl+L should NOT toggle legend (only bare L should)
		handleShortcutKey(host, "l", makeEvent("l", { ctrl: true }));
		expect(host.updateLegend).not.toHaveBeenCalled();
	});

	it("Meta+key modifiers block single-key shortcuts", () => {
		const host = mockHost();
		handleShortcutKey(host, "m", makeEvent("m", { meta: true }));
		expect(host.markDirty).not.toHaveBeenCalled();
	});

	it("Ctrl+F opens search input", () => {
		const host = mockHost();
		const searchEl = { focus: vi.fn() };
		(host.panelEl as any).querySelector = (sel: string) => (sel.includes("settings-filter") ? searchEl : null);
		handleShortcutKey(host, "f", makeEvent("f", { ctrl: true }));
		expect(searchEl.focus).toHaveBeenCalled();
	});

	it("0 resets zoom to 100%", () => {
		const host = mockHost();
		handleShortcutKey(host, "0", makeEvent("0"));
		expect(host.setZoom).toHaveBeenCalledWith(1.0);
		expect(host.announceA11y).toHaveBeenCalledWith("Zoom: 100%");
	});

	it("5 sets zoom to 50%", () => {
		const host = mockHost();
		handleShortcutKey(host, "5", makeEvent("5"));
		expect(host.setZoom).toHaveBeenCalledWith(0.5);
		expect(host.announceA11y).toHaveBeenCalledWith("Zoom: 50%");
	});

	it("Escape clears keyboard focus", () => {
		const host = mockHost({ isKeyboardFocused: true });
		const handled = handleShortcutKey(host, "Escape", makeEvent("Escape"));
		expect(handled).toBe(true);
		expect(host.cycleFocusNode).toHaveBeenCalled();
	});

	it("Escape does nothing when not focused (but still handled)", () => {
		const host = mockHost({ isKeyboardFocused: false });
		const handled = handleShortcutKey(host, "Escape", makeEvent("Escape"));
		expect(handled).toBe(true);
		expect(host.cycleFocusNode).not.toHaveBeenCalled();
	});

	it("Enter opens file when focused on node with filePath", () => {
		const host = mockHost({
			isKeyboardFocused: true,
			highlightedNodeId: "test.md",
		});
		host.pixiNodes.set("test.md", { data: { label: "Test", filePath: "folder/test.md" } });
		handleShortcutKey(host, "Enter", makeEvent("Enter"));
		expect(host.openFile).toHaveBeenCalledWith("folder/test.md");
	});

	it("Shift+Enter toggles multi-select", () => {
		const host = mockHost({
			isKeyboardFocused: true,
			highlightedNodeId: "node1",
		});
		host.panel.multiSelectNodeIds = ["node1"];
		host.pixiNodes.set("node1", { data: { label: "Node 1" } });
		handleShortcutKey(host, "Enter", makeEvent("Enter", { shift: true }));
		expect(host.toggleMultiSelect).toHaveBeenCalledWith("node1");
	});

	it("Z without highlighted node returns false", () => {
		const host = mockHost({ highlightedNodeId: null });
		const result = handleShortcutKey(host, "z", makeEvent("z"));
		expect(result).toBe(false);
		expect(host.focusZoomToNode).not.toHaveBeenCalled();
	});

	it("S/E set pathfinder start/end when node is highlighted", () => {
		const host = mockHost({ highlightedNodeId: "n1" });
		handleShortcutKey(host, "s", makeEvent("s"));
		expect(host.setPathfinderNode).toHaveBeenCalledWith("n1", "start");

		handleShortcutKey(host, "e", makeEvent("e"));
		expect(host.setPathfinderNode).toHaveBeenCalledWith("n1", "end");
	});

	it("ArrowLeft/Right pans horizontally when not focused", () => {
		const host = mockHost();
		handleShortcutKey(host, "ArrowLeft", makeEvent("ArrowLeft"));
		expect(host.worldContainer!.x).toBe(50);
		handleShortcutKey(host, "ArrowRight", makeEvent("ArrowRight"));
		expect(host.worldContainer!.x).toBe(0);
	});

	it("Shift+/ triggers help (same as ?)", () => {
		const host = mockHost();
		handleShortcutKey(host, "/", makeEvent("/", { shift: true }));
		expect(host.toggleHelpOverlay).toHaveBeenCalled();
	});

	it("Space with no graph-svg-wrap still returns true", () => {
		const host = mockHost();
		const handled = handleShortcutKey(host, " ", makeEvent(" "));
		expect(handled).toBe(true);
		expect(host.autoFitView).not.toHaveBeenCalled(); // no wrap found
	});

	it("null worldContainer does not crash arrow pan", () => {
		const host = mockHost({ worldContainer: null });
		expect(() => handleShortcutKey(host, "ArrowUp", makeEvent("ArrowUp"))).not.toThrow();
	});
});
