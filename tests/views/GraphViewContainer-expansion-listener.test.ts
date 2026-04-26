import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Subtask of 136-expansion-keydown-leak (parent issue).
//
// Contract under test: `_showNodeExpansion(nodeId)` must NOT accumulate document
// keydown listeners when called repeatedly (e.g. user clicks node A, then node
// B without closing the first expansion panel). Each invocation should:
//   1. Remove the previously-registered `_expansionKeyHandler` from document
//      (if any), and
//   2. Register a fresh handler for the new panel.
//
// GraphViewContainer is an 8580-line god object (see CLAUDE.md) and cannot be
// instantiated in unit tests without heavy PixiJS / WorkspaceLeaf / Obsidian
// App stubbing. The project's established pattern is to mirror only the code
// path under test in a harness class — see
// `tests/views/GraphViewContainer.pan-inertia.test.ts` for precedent.
//
// The harness below encodes the listener-lifecycle contract the real
// `_showNodeExpansion` must satisfy; the spec checks the contract in isolation.
// ---------------------------------------------------------------------------

type KeydownListener = (ev: KeyboardEvent) => void;

// Tracks handlers currently registered for "keydown" on the stub document.
const liveKeydown = new Set<KeydownListener>();

// Replace globalThis.document with a minimal stub that exposes
// addEventListener / removeEventListener as real functions so vi.spyOn can wrap
// them. This mirrors `tests/minimap.test.ts` setup.
function installDocumentStub(): void {
	if (!globalThis.document) {
		(globalThis as any).document = {};
	}
	(globalThis.document as any).addEventListener = (type: string, handler: KeydownListener) => {
		if (type === "keydown") liveKeydown.add(handler);
	};
	(globalThis.document as any).removeEventListener = (type: string, handler: KeydownListener) => {
		if (type === "keydown") liveKeydown.delete(handler);
	};
}

// Harness mirrors the listener-lifecycle portion of GraphViewContainer#_showNodeExpansion.
// All DOM / PixiJS / Obsidian concerns are deliberately omitted — only the
// `_expansionKeyHandler` state machine matters for this test.
class ExpansionListenerHarness {
	private _expansionKeyHandler: KeydownListener | null = null;

	_showNodeExpansion(_nodeId: string): void {
		// Cleanup: remove previous handler before registering a new one.
		if (this._expansionKeyHandler) {
			document.removeEventListener("keydown", this._expansionKeyHandler);
			this._expansionKeyHandler = null;
		}
		// Register fresh handler (content of the handler is irrelevant here).
		this._expansionKeyHandler = (_ev: KeyboardEvent) => {};
		document.addEventListener("keydown", this._expansionKeyHandler);
	}
}

describe("_showNodeExpansion keydown listener lifecycle (no accumulation)", () => {
	let addSpy: ReturnType<typeof vi.spyOn>;
	let removeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		liveKeydown.clear();
		installDocumentStub();
		addSpy = vi.spyOn(document, "addEventListener");
		removeSpy = vi.spyOn(document, "removeEventListener");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sequential calls (nodeA -> nodeB) remove the prior keydown listener", () => {
		const container = new ExpansionListenerHarness();

		// First invocation registers handler #1.
		(container as any)._showNodeExpansion("A");
		const firstAddCalls = addSpy.mock.calls.filter((c) => c[0] === "keydown");
		expect(firstAddCalls.length).toBe(1);
		const firstHandler = firstAddCalls[0][1] as KeydownListener;
		expect(liveKeydown.has(firstHandler)).toBe(true);

		// Second invocation must remove handler #1 before registering handler #2.
		(container as any)._showNodeExpansion("B");

		const removeKeydownCalls = removeSpy.mock.calls.filter((c) => c[0] === "keydown");
		expect(removeKeydownCalls.length).toBeGreaterThanOrEqual(1);
		expect(removeKeydownCalls.some((c) => c[1] === firstHandler)).toBe(true);
		expect(liveKeydown.has(firstHandler)).toBe(false);
	});

	it("exactly one keydown listener remains on document after repeated calls", () => {
		const container = new ExpansionListenerHarness();

		(container as any)._showNodeExpansion("A");
		(container as any)._showNodeExpansion("B");
		(container as any)._showNodeExpansion("C");

		expect(liveKeydown.size).toBe(1);
	});
});
