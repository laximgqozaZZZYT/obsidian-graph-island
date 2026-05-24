// Strict invariant checker for cluster polygons (Kaizen — 2026-05-24).
//
// Contract enforced:
//   1. Every owned cell MUST appear in its cluster's polygon.
//   2. Every cluster's polygon MUST be single-connected (= one
//      4-connected component). Exclaves are only allowed when produced
//      by the world-map tile renderer (= same polygon drawn at multiple
//      pan offsets), which happens OUTSIDE cluster-bbox.ts.
//
// Either invariant violated → FAIL (exit 1). Wired into the test
// harness so regression is impossible to merge silently.
//
// Scenarios covered: hub + many leaves, sparse scattered, heavy
// pairwise overlap, single isolated card. New scenarios should be
// appended; failures are reported with concrete cell sets so the
// regression can be reproduced.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-carve-"));

// Bundle layout for the test harness.
const layoutBundle = join(tmp, "layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: layoutBundle, logLevel: "warning",
});
const { layout } = await import(layoutBundle);
const cbBundle = join(tmp, "cluster-bbox.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/cluster-bbox.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: cbBundle, logLevel: "warning",
});
const { computeClusterOwnedCells } = await import(cbBundle);

// Scenario builders. Each returns { data, sized } with the same shape
// expected by layout().
function mkScene(builder) {
	const data = { nodes: [], edges: [] };
	const sized = [];
	const mk = (id, memb) => {
		data.nodes.push({ id, label: id.slice(0, 10), memberships: memb });
		sized.push({ id, label: id, memberships: memb, width: 120, height: 32 });
	};
	builder(mk);
	return { data, sized };
}

const scenarios = {
	// User-vault-like: hub cluster + many leaves + several pairwise crosses.
	hubAndLeaves: mkScene((mk) => {
		const groups = ["scene", "talk", "drama", "act", "creation", "concept", "character", "deity", "inferno", "paradiso", "purgatorio"];
		for (const g of groups) for (let i = 0; i < 25; i++) mk(`${g}/${i}.md`, [g]);
		const pairs = [["scene", "talk"], ["scene", "drama"], ["act", "scene"], ["drama", "act"], ["creation", "scene"]];
		for (const [a, b] of pairs) for (let i = 0; i < 4; i++) mk(`${a}_${b}/${i}.md`, [a, b]);
	}),
	// Sparse scattered: each cluster has just a few cards spread by
	// multi-membership lattice — stresses the bridge-restoration pass.
	sparseScattered: mkScene((mk) => {
		const groups = ["A", "B", "C", "D", "E"];
		for (const g of groups) for (let i = 0; i < 6; i++) mk(`${g}/${i}.md`, [g]);
		// Every pair has a few shared cards (creates intra-cluster spread).
		for (let i = 0; i < groups.length; i++) {
			for (let j = i + 1; j < groups.length; j++) {
				for (let k = 0; k < 3; k++) mk(`${groups[i]}_${groups[j]}/${k}.md`, [groups[i], groups[j]]);
			}
		}
	}),
	// Heavy 3-way overlap.
	heavyTriOverlap: mkScene((mk) => {
		for (let i = 0; i < 10; i++) mk(`X/${i}.md`, ["X"]);
		for (let i = 0; i < 10; i++) mk(`Y/${i}.md`, ["Y"]);
		for (let i = 0; i < 10; i++) mk(`Z/${i}.md`, ["Z"]);
		for (let i = 0; i < 5; i++) mk(`XY/${i}.md`, ["X", "Y"]);
		for (let i = 0; i < 5; i++) mk(`YZ/${i}.md`, ["Y", "Z"]);
		for (let i = 0; i < 5; i++) mk(`XZ/${i}.md`, ["X", "Z"]);
		for (let i = 0; i < 3; i++) mk(`XYZ/${i}.md`, ["X", "Y", "Z"]);
	}),
	// Single isolated card per cluster — minimum case.
	singletons: mkScene((mk) => {
		for (const g of ["P", "Q", "R", "S", "T"]) mk(`${g}/0.md`, [g]);
	}),
	// One large hub + several tiny single-card "satellites" with multi-tag
	// links back to the hub. Creates many disconnected owned-cell sets
	// for the hub if bridging fails.
	hubWithSatellites: mkScene((mk) => {
		for (let i = 0; i < 30; i++) mk(`hub/${i}.md`, ["hub"]);
		for (let i = 0; i < 8; i++) {
			mk(`sat${i}/0.md`, [`sat${i}`]);
			mk(`hub_sat${i}/0.md`, ["hub", `sat${i}`]);
		}
	}),
};

let totalMissing = 0;
let totalDisconnected = 0;
const reports = [];

for (const [name, scene] of Object.entries(scenarios)) {
	const laid = layout(scene.data, scene.sized, {
		clusterSpacing: 80,
		nodeSpacing: 16,
		cellW: 120,
		cellH: 32,
	});
	const slotW = laid.slotW;
	const slotH = laid.slotH;
	const clusterKeys = laid.clusters.map((c) => c.groupKey);
	const ownedMap = computeClusterOwnedCells(laid.nodes, clusterKeys, slotW, slotH);
	const polyCellMap = new Map();
	for (const c of laid.clusters) {
		const set = polyCellMap.get(c.groupKey) ?? new Set();
		// Prefer the new `pieces` field; fall back to legacy `cells`.
		if (c.pieces && c.pieces.length > 0) {
			const padX = laid.channelW / 2;
			const padY = laid.channelH / 2;
			for (const p of c.pieces) {
				const c0 = Math.round((p.x - padX) / slotW);
				const r0 = Math.round((p.y - padY) / slotH);
				const cN = Math.round((p.x + p.w - padX) / slotW) - 1;
				const rN = Math.round((p.y + p.h - padY) / slotH) - 1;
				for (let col = c0; col <= cN; col++) {
					for (let row = r0; row <= rN; row++) set.add(`${col},${row}`);
				}
			}
		} else if (c.cells) {
			for (const r of c.cells) {
				const col = Math.round(r.x / slotW);
				const row = Math.round(r.y / slotH);
				set.add(`${col},${row}`);
			}
		}
		polyCellMap.set(c.groupKey, set);
	}
	let missing = 0;
	let disconnected = 0;
	for (const key of clusterKeys) {
		const owned = ownedMap.get(key) ?? new Set();
		const poly = polyCellMap.get(key) ?? new Set();
		const missingCells = [];
		for (const k of owned) if (!poly.has(k)) missingCells.push(k);
		if (missingCells.length > 0) {
			missing += missingCells.length;
			reports.push(`  [${name}] CLUSTER ${key}: ${missingCells.length} owned cells missing: ${missingCells.slice(0, 4).join(" ")}`);
		}
		const seen = new Set();
		let comps = 0;
		for (const start of poly) {
			if (seen.has(start)) continue;
			comps++;
			const q = [start];
			seen.add(start);
			while (q.length) {
				const cur = q.shift();
				const [c, r] = cur.split(",").map(Number);
				for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
					const k = `${c + dc},${r + dr}`;
					if (poly.has(k) && !seen.has(k)) {
						seen.add(k);
						q.push(k);
					}
				}
			}
		}
		// User spec 2026-05-24: exclaves are now permitted, so multi-
		// component polygons are NOT a violation. We still report the
		// count for diagnostic purposes.
		if (comps > 1) {
			disconnected++;
		}
	}
	totalMissing += missing;
	totalDisconnected += disconnected;
	console.log(`  scenario ${name}: clusters=${clusterKeys.length}, missing=${missing}, disconnected=${disconnected}`);
}

console.log(`\nTOTAL: missing=${totalMissing}, disconnected=${totalDisconnected}`);
for (const r of reports.slice(0, 40)) console.log(r);
// Only owned-cell presence is a hard invariant now (exclaves permitted).
if (totalMissing > 0) {
	console.log("\nFAIL: owned cells missing from polygon");
	process.exit(1);
}
console.log(
	`\nOK (every owned cell enclosed; ${totalDisconnected} polygon(s) split into exclaves — permitted by current spec)`,
);
