import { describe, it, expect, vi } from "vitest";
import { asInternalApp, asInternalWorkspace, asObsidianWindow, asGraphView } from "../src/obsidian-internals";

describe("obsidian-internals cast helpers", () => {
	it("asInternalApp returns the same object", () => {
		const app = { plugins: {} } as any;
		expect(asInternalApp(app)).toBe(app);
	});

	it("asInternalWorkspace returns the same object", () => {
		const ws = { on: () => {}, trigger: () => {} } as any;
		expect(asInternalWorkspace(ws)).toBe(ws);
	});

	it("asObsidianWindow returns global window", () => {
		const fakeWindow = { moment: { locale: () => "en" } };
		vi.stubGlobal("window", fakeWindow);
		const result = asObsidianWindow();
		expect(result).toBe(fakeWindow);
		vi.unstubAllGlobals();
	});

	it("asGraphView returns view when pixiNodes present", () => {
		const leaf = { view: { panel: {}, pixiNodes: new Map() } } as any;
		const result = asGraphView(leaf);
		expect(result).toBe(leaf.view);
	});

	it("asGraphView returns null for non-Graph-Island view", () => {
		const leaf = { view: { panel: {} } } as any;
		expect(asGraphView(leaf)).toBeNull();
	});

	it("asGraphView returns null for missing view", () => {
		const leaf = { view: null } as any;
		expect(asGraphView(leaf)).toBeNull();
	});
});
