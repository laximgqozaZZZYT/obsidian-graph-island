// UpSet plot layout — data preparation only.
//
// The UpSet plot is rendered in SCREEN space as a fixed footer (see
// draw-upset.ts) so fonts and dots stay readable at every world
// zoom. Card stacking — the previous "1 card per node in world
// coords" pipeline — was removed because it forced fit-to-view to
// compete between the overview matrix and the per-node detail; the
// detail panel (separate UI) replaces that role.
//
// This module therefore just:
//   - Buckets nodes by their exact membership signature.
//   - Collects per-set total sizes.
//   - Sorts columns and applies the min-size cull.
//
// Geometry (row heights, column widths, label positions) is computed
// by draw-upset.ts from the canvas dimensions at paint time.
import type { GraphData } from "./types";
import type { LaidOut, UpsetMeta } from "./layout";

export interface UpsetLayoutOptions {
	cellW: number;
	cellH: number;
	nodeSpacing: number;
	clusterLabels: Map<string, string>;
	columnSort?: "size" | "degree";
	minColumnSize?: number;
}

interface Sized {
	id: string;
	width: number;
	height: number;
}

export function layoutUpset(
	data: GraphData,
	sized: Sized[],
	opts: UpsetLayoutOptions,
): LaidOut {
	void sized;

	// --- 1. Sets (rows). HAVING-failed clusters are already absent
	// from node.memberships by the time we get here, so any membership
	// key seen here is one that survived the upstream filters.
	const setSizes = new Map<string, number>();
	for (const n of data.nodes) {
		for (const m of n.memberships) {
			setSizes.set(m, (setSizes.get(m) ?? 0) + 1);
		}
	}
	const setKeys = [...setSizes.keys()].sort((a, b) => {
		const da = setSizes.get(b)! - setSizes.get(a)!;
		return da !== 0 ? da : a.localeCompare(b);
	});

	// --- 2. Buckets keyed by exact membership signature.
	// "|" separator avoids the {ab, c} / {a, bc} collision the naive
	// `.join("")` would produce.
	const sigToBucket = new Map<
		string,
		{ signature: string[]; nodeIds: string[] }
	>();
	for (const n of data.nodes) {
		if (n.memberships.length === 0) continue;
		const sorted = [...n.memberships].sort();
		const key = sorted.join("|");
		const entry = sigToBucket.get(key);
		if (entry) entry.nodeIds.push(n.id);
		else sigToBucket.set(key, { signature: sorted, nodeIds: [n.id] });
	}

	// --- 3. Min-size cull. Defaults to keeping everything.
	const minSize = Math.max(1, opts.minColumnSize ?? 1);
	const buckets = [...sigToBucket.values()].filter(
		(b) => b.nodeIds.length >= minSize,
	);

	// --- 4. Column sort.
	const sortMode = opts.columnSort ?? "size";
	buckets.sort((a, b) => {
		if (sortMode === "degree") {
			if (a.signature.length !== b.signature.length)
				return a.signature.length - b.signature.length;
			if (b.nodeIds.length !== a.nodeIds.length)
				return b.nodeIds.length - a.nodeIds.length;
		} else {
			if (b.nodeIds.length !== a.nodeIds.length)
				return b.nodeIds.length - a.nodeIds.length;
			if (a.signature.length !== b.signature.length)
				return a.signature.length - b.signature.length;
		}
		return a.signature.join().localeCompare(b.signature.join());
	});

	// --- 5. Stable node order inside each column (by id) so the same
	// intersection always lists the same files in the same order in
	// the detail panel.
	for (const bucket of buckets) {
		bucket.nodeIds.sort((a, b) => a.localeCompare(b));
	}

	const sets: UpsetMeta["sets"] = setKeys.map((key) => ({
		key,
		label: opts.clusterLabels.get(key) ?? key,
		size: setSizes.get(key) ?? 0,
	}));
	const columns: UpsetMeta["columns"] = buckets.map((b) => ({
		signature: b.signature,
		nodeIds: b.nodeIds,
		size: b.nodeIds.length,
	}));

	// Channel sizes still flow through so the world-space grid
	// renderer can derive a lattice even when no nodes are positioned.
	const channelW = Math.max(12, opts.nodeSpacing);
	const channelH = Math.max(6, Math.round(opts.nodeSpacing / 2));
	const slotW = (opts.cellW > 0 ? opts.cellW : 80) + channelW;
	const slotH = (opts.cellH > 0 ? opts.cellH : 24) + channelH;

	return {
		nodes: [],
		edges: [],
		clusters: [],
		trunks: [],
		slotW,
		slotH,
		channelW,
		channelH,
		upset: { sets, columns },
	};
}
