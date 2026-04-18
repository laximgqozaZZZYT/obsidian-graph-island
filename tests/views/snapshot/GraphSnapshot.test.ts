import { describe, it, expect, vi } from "vitest";
import {
	AUTO_SNAP_PREFIX,
	AUTO_SNAP_MAX,
	serializeState,
	restoreState,
	buildAutoSnapshotName,
	pruneAutoSnapshots,
	appendAutoSnapshot,
	createAutoSnapshotHandler,
	type AutoSnapshotHost,
	type TimerHooks,
} from "../../../src/views/snapshot/GraphSnapshot";
import type { GraphData, GraphSnapshot } from "../../../src/types";

const ctx = { layout: "force", searchQuery: "", groupBy: "" };

function makeData(nodes = 2, edges = 1): GraphData {
	const ns = Array.from({ length: nodes }, (_, i) => ({
		id: `n${i}`,
		label: `N${i}`,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		meta: { k: i } as Record<string, unknown>,
	}));
	const es = Array.from({ length: edges }, (_, i) => ({
		id: `e${i}`,
		source: `n${i}`,
		target: `n${(i + 1) % nodes}`,
		type: "link" as const,
	}));
	return { nodes: ns, edges: es };
}

describe("GraphSnapshot: serializeState", () => {
	it("returns null for null input", () => {
		expect(serializeState(null, "x", ctx)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(serializeState(undefined, "x", ctx)).toBeNull();
	});

	it("returns null when nodes is missing", () => {
		expect(serializeState({ edges: [] } as unknown as GraphData, "x", ctx)).toBeNull();
	});

	it("returns null when edges is missing", () => {
		expect(serializeState({ nodes: [] } as unknown as GraphData, "x", ctx)).toBeNull();
	});

	it("captures id/context for valid data", () => {
		const snap = serializeState(makeData(3, 2), "my-snap", ctx);
		expect(snap).not.toBeNull();
		expect(snap!.name).toBe("my-snap");
		expect(snap!.nodes).toHaveLength(3);
		expect(snap!.edges).toHaveLength(2);
		expect(snap!.context.nodeCount).toBe(3);
		expect(snap!.context.edgeCount).toBe(2);
	});
});

describe("GraphSnapshot: restoreState", () => {
	it("returns null for null", () => {
		expect(restoreState(null)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(restoreState(undefined)).toBeNull();
	});

	it("preserves name/createdAt/notes", () => {
		const snap: GraphSnapshot = {
			name: "n",
			createdAt: "2026-01-01T00:00:00.000Z",
			notes: "memo",
			nodes: [{ id: "a", metaHash: "" }],
			edges: [{ source: "a", target: "b", type: "link" }],
			context: { layout: "force", searchQuery: "", groupBy: "", nodeCount: 1, edgeCount: 1 },
		};
		const restored = restoreState(snap);
		expect(restored?.name).toBe("n");
		expect(restored?.createdAt).toBe("2026-01-01T00:00:00.000Z");
		expect(restored?.notes).toBe("memo");
	});

	it("tolerates missing nodes/edges arrays", () => {
		const snap = {
			name: "n",
			createdAt: "t",
			context: { layout: "", searchQuery: "", groupBy: "", nodeCount: 0, edgeCount: 0 },
		} as unknown as GraphSnapshot;
		const restored = restoreState(snap);
		expect(restored?.nodes).toEqual([]);
		expect(restored?.edges).toEqual([]);
	});
});

describe("GraphSnapshot: round-trip", () => {
	it("serializeState → restoreState preserves node ids", () => {
		const data = makeData(4, 3);
		const snap = serializeState(data, "rt", ctx);
		const restored = restoreState(snap);
		expect(restored?.nodes.map((n) => n.id)).toEqual(data.nodes.map((n) => n.id));
	});

	it("serializeState → restoreState preserves edge source/target/type", () => {
		const data = makeData(3, 2);
		const snap = serializeState(data, "rt", ctx);
		const restored = restoreState(snap);
		expect(restored?.edges).toEqual(
			data.edges.map((e) => ({ source: e.source, target: e.target, type: e.type })),
		);
	});

	it("serializeState → restoreState preserves context", () => {
		const data = makeData(2, 1);
		const snap = serializeState(data, "rt", { layout: "grid", searchQuery: "q", groupBy: "tag" });
		const restored = restoreState(snap);
		expect(restored?.context.layout).toBe("grid");
		expect(restored?.context.searchQuery).toBe("q");
		expect(restored?.context.groupBy).toBe("tag");
		expect(restored?.context.nodeCount).toBe(2);
		expect(restored?.context.edgeCount).toBe(1);
	});

	it("null-round-trip: null data → null snapshot → null restored", () => {
		const snap = serializeState(null, "n", ctx);
		expect(snap).toBeNull();
		expect(restoreState(snap)).toBeNull();
	});
});

describe("GraphSnapshot: buildAutoSnapshotName", () => {
	it("uses AUTO_SNAP_PREFIX", () => {
		const name = buildAutoSnapshotName(new Date("2026-04-19T05:30:00.000Z"));
		expect(name.startsWith(AUTO_SNAP_PREFIX)).toBe(true);
	});

	it("formats as YYYY-MM-DD HH:MM", () => {
		const name = buildAutoSnapshotName(new Date("2026-04-19T05:30:00.000Z"));
		expect(name).toBe("[auto] 2026-04-19 05:30");
	});

	it("defaults to current time when no date given", () => {
		const name = buildAutoSnapshotName();
		expect(name.startsWith(AUTO_SNAP_PREFIX)).toBe(true);
		expect(name.length).toBe(AUTO_SNAP_PREFIX.length + 16);
	});
});

describe("GraphSnapshot: pruneAutoSnapshots", () => {
	function autoSnap(name: string): GraphSnapshot {
		return {
			name: AUTO_SNAP_PREFIX + name,
			createdAt: name,
			nodes: [],
			edges: [],
			context: { layout: "", searchQuery: "", groupBy: "", nodeCount: 0, edgeCount: 0 },
		};
	}
	function manualSnap(name: string): GraphSnapshot {
		return {
			name,
			createdAt: name,
			nodes: [],
			edges: [],
			context: { layout: "", searchQuery: "", groupBy: "", nodeCount: 0, edgeCount: 0 },
		};
	}

	it("returns unchanged when below limit", () => {
		const snaps = [autoSnap("a"), autoSnap("b")];
		pruneAutoSnapshots(snaps, 5);
		expect(snaps).toHaveLength(2);
	});

	it("removes oldest auto-snap when at limit", () => {
		const snaps = [autoSnap("1"), autoSnap("2"), autoSnap("3")];
		pruneAutoSnapshots(snaps, 3);
		expect(snaps).toHaveLength(2);
		expect(snaps[0].name).toBe(AUTO_SNAP_PREFIX + "2");
	});

	it("never removes manual snapshots", () => {
		const snaps = [manualSnap("keep1"), autoSnap("a"), manualSnap("keep2"), autoSnap("b")];
		pruneAutoSnapshots(snaps, 2);
		expect(snaps.filter((s) => s.name.startsWith(AUTO_SNAP_PREFIX))).toHaveLength(1);
		expect(snaps.filter((s) => !s.name.startsWith(AUTO_SNAP_PREFIX))).toHaveLength(2);
	});

	it("uses AUTO_SNAP_MAX by default", () => {
		const snaps = Array.from({ length: AUTO_SNAP_MAX + 1 }, (_, i) => autoSnap(`${i}`));
		pruneAutoSnapshots(snaps);
		expect(snaps.length).toBeLessThan(AUTO_SNAP_MAX + 1);
	});
});

describe("GraphSnapshot: appendAutoSnapshot", () => {
	it("appends a snapshot on valid data", () => {
		const snaps: GraphSnapshot[] = [];
		const snap = appendAutoSnapshot(snaps, makeData(2, 1), ctx, new Date("2026-04-19T10:00:00.000Z"));
		expect(snap).not.toBeNull();
		expect(snaps).toHaveLength(1);
		expect(snaps[0].name).toBe("[auto] 2026-04-19 10:00");
	});

	it("returns null for null data and leaves array untouched", () => {
		const snaps: GraphSnapshot[] = [];
		const snap = appendAutoSnapshot(snaps, null, ctx);
		expect(snap).toBeNull();
		expect(snaps).toHaveLength(0);
	});

	it("returns null for undefined data", () => {
		const snaps: GraphSnapshot[] = [];
		expect(appendAutoSnapshot(snaps, undefined, ctx)).toBeNull();
		expect(snaps).toHaveLength(0);
	});

	it("prunes before appending", () => {
		const snaps: GraphSnapshot[] = Array.from({ length: AUTO_SNAP_MAX }, (_, i) => ({
			name: AUTO_SNAP_PREFIX + i,
			createdAt: String(i),
			nodes: [],
			edges: [],
			context: { layout: "", searchQuery: "", groupBy: "", nodeCount: 0, edgeCount: 0 },
		}));
		appendAutoSnapshot(snaps, makeData(1, 0), ctx, new Date("2026-04-19T10:00:00.000Z"));
		expect(snaps.length).toBeLessThanOrEqual(AUTO_SNAP_MAX);
		expect(snaps[snaps.length - 1].name).toBe("[auto] 2026-04-19 10:00");
	});
});

// ---------------------------------------------------------------------------
// createAutoSnapshotHandler — debounced scheduler extracted from GVC
// ---------------------------------------------------------------------------
describe("GraphSnapshot: createAutoSnapshotHandler", () => {
	type FakeTimer = { id: number; cb: () => void; ms: number; active: boolean };

	function makeTimers(): {
		hooks: TimerHooks;
		fire: (id: number) => void;
		fireAll: () => void;
		pending: () => FakeTimer[];
	} {
		let nextId = 1;
		const timers: FakeTimer[] = [];
		const hooks: TimerHooks = {
			setTimeout: (cb, ms) => {
				const id = nextId++;
				timers.push({ id, cb, ms, active: true });
				return id;
			},
			clearTimeout: (id) => {
				const t = timers.find((x) => x.id === id);
				if (t) t.active = false;
			},
		};
		return {
			hooks,
			fire: (id) => {
				const t = timers.find((x) => x.id === id);
				if (t && t.active) {
					t.active = false;
					t.cb();
				}
			},
			fireAll: () => {
				for (const t of timers) {
					if (t.active) {
						t.active = false;
						t.cb();
					}
				}
			},
			pending: () => timers.filter((t) => t.active),
		};
	}

	function makeHost(
		overrides: Partial<AutoSnapshotHost> & { snapshots?: GraphSnapshot[] } = {},
	): { host: AutoSnapshotHost; snapshots: GraphSnapshot[]; persistSpy: ReturnType<typeof vi.fn> } {
		const snapshots = overrides.snapshots ?? [];
		const persistSpy = vi.fn();
		const host: AutoSnapshotHost = {
			getIntervalMin: overrides.getIntervalMin ?? (() => 1),
			hasGraphData: overrides.hasGraphData ?? (() => true),
			getGraphData: overrides.getGraphData ?? (() => makeData(2, 1)),
			getContext: overrides.getContext ?? (() => ctx),
			getSnapshots: overrides.getSnapshots ?? (() => snapshots),
			persist: overrides.persist ?? persistSpy,
		};
		return { host, snapshots, persistSpy };
	}

	it("does nothing when interval is 0 (disabled)", () => {
		const { host, persistSpy } = makeHost({ getIntervalMin: () => 0 });
		const { hooks, pending } = makeTimers();
		const handler = createAutoSnapshotHandler(host, hooks);
		handler.trigger();
		expect(pending()).toHaveLength(0);
		expect(persistSpy).not.toHaveBeenCalled();
	});

	it("does nothing when interval is negative", () => {
		const { host } = makeHost({ getIntervalMin: () => -5 });
		const { hooks, pending } = makeTimers();
		createAutoSnapshotHandler(host, hooks).trigger();
		expect(pending()).toHaveLength(0);
	});

	it("schedules a timer using interval * 60 * 1000 ms", () => {
		const { host } = makeHost({ getIntervalMin: () => 2 });
		const { hooks, pending } = makeTimers();
		createAutoSnapshotHandler(host, hooks).trigger();
		const p = pending();
		expect(p).toHaveLength(1);
		expect(p[0].ms).toBe(2 * 60 * 1000);
	});

	it("debounces: a second trigger cancels the prior pending timer", () => {
		const { host } = makeHost();
		const { hooks, pending } = makeTimers();
		const handler = createAutoSnapshotHandler(host, hooks);
		handler.trigger();
		handler.trigger();
		expect(pending()).toHaveLength(1);
	});

	it("appends snapshot and calls persist after debounce fires", () => {
		const { host, snapshots, persistSpy } = makeHost();
		const { hooks, fireAll } = makeTimers();
		createAutoSnapshotHandler(host, hooks).trigger();
		fireAll();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0].name.startsWith(AUTO_SNAP_PREFIX)).toBe(true);
		expect(persistSpy).toHaveBeenCalledOnce();
	});

	it("skips persistence when hasGraphData() is false", () => {
		const { host, snapshots, persistSpy } = makeHost({ hasGraphData: () => false });
		const { hooks, fireAll } = makeTimers();
		createAutoSnapshotHandler(host, hooks).trigger();
		fireAll();
		expect(snapshots).toHaveLength(0);
		expect(persistSpy).not.toHaveBeenCalled();
	});

	it("skips persistence when snapshot serialization returns null", () => {
		const { host, snapshots, persistSpy } = makeHost({ getGraphData: () => null });
		const { hooks, fireAll } = makeTimers();
		createAutoSnapshotHandler(host, hooks).trigger();
		fireAll();
		expect(snapshots).toHaveLength(0);
		expect(persistSpy).not.toHaveBeenCalled();
	});

	it("cancel() clears any pending timer", () => {
		const { host, persistSpy } = makeHost();
		const { hooks, fireAll, pending } = makeTimers();
		const handler = createAutoSnapshotHandler(host, hooks);
		handler.trigger();
		expect(pending()).toHaveLength(1);
		handler.cancel();
		fireAll();
		expect(persistSpy).not.toHaveBeenCalled();
	});
});
