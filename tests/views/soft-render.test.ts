import { describe, it, expect, vi } from "vitest";
import { applySoftRender } from "../../src/views/soft-render";
import type { GraphData, GraphNode } from "../../src/types";

function makeNode(id: string): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0 };
}

interface HostOpts {
	graphData?: GraphData;
	graphDataFn?: () => GraphData;
	pixiNodeIds?: string[];
	doRender?: () => Promise<void>;
}

function makeHost(opts: HostOpts = {}) {
	const log: string[] = [];
	const record = (name: string) => (): void => {
		log.push(name);
	};
	const pixiNodes = new Map<string, object>();
	for (const id of opts.pixiNodeIds ?? []) pixiNodes.set(id, {});

	const gdFn = opts.graphDataFn ?? ((): GraphData => opts.graphData ?? { nodes: [], edges: [] });
	const userDoRender = opts.doRender;

	const host = {
		pixiNodes,
		_invalidateRenderCaches: vi.fn(record("_invalidateRenderCaches")),
		getGraphData: vi.fn((): GraphData => {
			log.push("getGraphData");
			return gdFn();
		}),
		_buildGraphMetadata: vi.fn(record("_buildGraphMetadata")),
		_buildTagMembership: vi.fn(record("_buildTagMembership")),
		_buildMissingNeighborSet: vi.fn(record("_buildMissingNeighborSet")),
		recolorNodes: vi.fn(record("recolorNodes")),
		recalcNodeRadii: vi.fn(record("recalcNodeRadii")),
		setStatus: vi.fn(record("setStatus")),
		markDirty: vi.fn(record("markDirty")),
		doRender: vi.fn(async (): Promise<void> => {
			log.push("doRender:start");
			if (userDoRender) await userDoRender();
			log.push("doRender:end");
		}),
	};
	return { host, log, pixiNodes };
}

// soft-render.ts only touches `pixiNodes` values as opaque map entries
// (has/delete/keys) — structural `PixiNode` compatibility is not required,
// so a cast through `unknown` is safe for this contract.
type ApplyArg = Parameters<typeof applySoftRender>[0];
function asHost(h: ReturnType<typeof makeHost>["host"]): ApplyArg {
	return h as unknown as ApplyArg;
}

describe("applySoftRender", () => {
	it("runs the build-and-mark pipeline in order when all gd nodes already exist in pixiNodes", async () => {
		const gd: GraphData = { nodes: [makeNode("a"), makeNode("b")], edges: [] };
		const { host, log } = makeHost({ graphData: gd, pixiNodeIds: ["a", "b"] });

		await applySoftRender(asHost(host));

		expect(log).toEqual([
			"_invalidateRenderCaches",
			"getGraphData",
			"_buildGraphMetadata",
			"_buildTagMembership",
			"_buildMissingNeighborSet",
			"recolorNodes",
			"recalcNodeRadii",
			"setStatus",
			"markDirty",
		]);
		expect(host.doRender).not.toHaveBeenCalled();
		expect(host.markDirty).toHaveBeenCalledWith(true);
		expect(host.setStatus).toHaveBeenCalledWith("2 nodes, 0 edges");
	});

	it("delegates to doRender and awaits it before resolving when a gd node is missing from pixiNodes", async () => {
		const gd: GraphData = { nodes: [makeNode("new")], edges: [] };
		let resolveDoRender!: () => void;
		const doRenderGate = new Promise<void>((r) => {
			resolveDoRender = r;
		});

		const { host } = makeHost({
			graphData: gd,
			pixiNodeIds: [],
			doRender: () => doRenderGate,
		});

		let outerSettled = false;
		const promise = applySoftRender(asHost(host)).then(() => {
			outerSettled = true;
		});

		// Flush a few microtasks so applySoftRender can reach `await host.doRender()`.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(host.doRender).toHaveBeenCalledTimes(1);
		// Proof that `await host.doRender()` suspended applySoftRender's own Promise.
		expect(outerSettled).toBe(false);

		resolveDoRender();
		await promise;

		expect(outerSettled).toBe(true);
		// Build/recolor/status/markDirty chain must be skipped on this branch.
		expect(host._buildGraphMetadata).not.toHaveBeenCalled();
		expect(host.recolorNodes).not.toHaveBeenCalled();
		expect(host.markDirty).not.toHaveBeenCalled();
	});

	it("returns early when getGraphData throws, without invoking any downstream host method", async () => {
		const { host, log } = makeHost({
			graphDataFn: () => {
				throw new Error("boom");
			},
		});

		await expect(applySoftRender(asHost(host))).resolves.toBeUndefined();

		expect(log).toEqual(["_invalidateRenderCaches", "getGraphData"]);
		expect(host._buildGraphMetadata).not.toHaveBeenCalled();
		expect(host.markDirty).not.toHaveBeenCalled();
		expect(host.doRender).not.toHaveBeenCalled();
	});

	it("removes pixiNodes whose ids are no longer in gd, leaving only surviving ids", async () => {
		const gd: GraphData = { nodes: [makeNode("a")], edges: [] };
		const { host, pixiNodes } = makeHost({
			graphData: gd,
			pixiNodeIds: ["a", "stale1", "stale2"],
		});

		await applySoftRender(asHost(host));

		expect(Array.from(pixiNodes.keys())).toEqual(["a"]);
	});

	it("drives the full pipeline with a 0/0 status string when gd is empty", async () => {
		const gd: GraphData = { nodes: [], edges: [] };
		const { host, log } = makeHost({ graphData: gd, pixiNodeIds: [] });

		await applySoftRender(asHost(host));

		expect(log).toEqual([
			"_invalidateRenderCaches",
			"getGraphData",
			"_buildGraphMetadata",
			"_buildTagMembership",
			"_buildMissingNeighborSet",
			"recolorNodes",
			"recalcNodeRadii",
			"setStatus",
			"markDirty",
		]);
		expect(host.setStatus).toHaveBeenCalledWith("0 nodes, 0 edges");
		expect(host.markDirty).toHaveBeenCalledWith(true);
		expect(host.doRender).not.toHaveBeenCalled();
	});

	it("forwards the same GraphData reference to all three _build* calls", async () => {
		const gd: GraphData = { nodes: [makeNode("a")], edges: [] };
		const { host } = makeHost({ graphData: gd, pixiNodeIds: ["a"] });

		await applySoftRender(asHost(host));

		expect(host._buildGraphMetadata).toHaveBeenCalledWith(gd);
		expect(host._buildTagMembership).toHaveBeenCalledWith(gd);
		expect(host._buildMissingNeighborSet).toHaveBeenCalledWith(gd);
	});
});
