// Verify that after cluster bbox carving, every owned cell remains in
// the cluster's polygon. If any owned cell is dropped, the carving is
// over-aggressive (= user bug: "card visible but not enclosed").
//
// Also reports clusters whose polygon is disconnected — even when all
// owned cells are present, deep disconnection makes the outline look
// like scattered tiny rects.
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

// Build a scene mimicking the user's vault: several clusters with many
// nodes, some scattered owned cells per cluster.
const data = { nodes: [], edges: [] };
const sized = [];
function mkNode(id, memb) {
	data.nodes.push({ id, label: id.slice(0, 10), memberships: memb });
	sized.push({ id, label: id, memberships: memb, width: 120, height: 32 });
}
const groups = ["scene", "talk", "drama", "act", "creation", "concept", "character", "deity", "inferno", "paradiso", "purgatorio"];
for (const g of groups) {
	for (let i = 0; i < 25; i++) mkNode(`${g}/${i}.md`, [g]);
}
// Multi-membership cards to create AABB overlaps.
const pairs = [["scene", "talk"], ["scene", "drama"], ["act", "scene"], ["drama", "act"], ["creation", "scene"]];
for (const [a, b] of pairs) {
	for (let i = 0; i < 4; i++) mkNode(`${a}_${b}/${i}.md`, [a, b]);
}

const laid = layout(data, sized, { clusterSpacing: 80, nodeSpacing: 16, cellW: 120, cellH: 32 });
const slotW = laid.slotW;
const slotH = laid.slotH;

// Per-cluster owned-cell map (re-compute since clusters carry only the
// outline + cell rects, not the owned set).
const clusterKeys = laid.clusters.map(c => c.groupKey);
const ownedMap = computeClusterOwnedCells(laid.nodes, clusterKeys, slotW, slotH);

// Build per-cluster "polygon cell set" from the cells field.
const polyCellMap = new Map();
for (const c of laid.clusters) {
	const set = new Set();
	if (c.cells) {
		for (const r of c.cells) {
			// Convert pixel rect back to "col,row".
			const col = Math.round(r.x / slotW);
			const row = Math.round(r.y / slotH);
			set.add(`${col},${row}`);
		}
	}
	polyCellMap.set(c.groupKey, set);
}

let missing = 0;
let disconnected = 0;
const reports = [];
for (const key of clusterKeys) {
	const owned = ownedMap.get(key) ?? new Set();
	const poly = polyCellMap.get(key) ?? new Set();
	// (1) every owned cell present in polygon?
	const missingCells = [];
	for (const k of owned) {
		if (!poly.has(k)) missingCells.push(k);
	}
	if (missingCells.length > 0) {
		missing += missingCells.length;
		reports.push(`  CLUSTER ${key}: ${missingCells.length} owned cells missing from polygon: ${missingCells.slice(0, 5).join(" ")}...`);
	}
	// (2) connected-components of polygon
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
	if (comps > 1) {
		disconnected++;
		reports.push(`  CLUSTER ${key}: polygon has ${comps} disconnected components (owned=${owned.size}, poly=${poly.size})`);
	}
}
console.log(`Cluster polygon verification:`);
console.log(`  total clusters: ${clusterKeys.length}`);
console.log(`  owned cells missing from polygon: ${missing}`);
console.log(`  disconnected polygons: ${disconnected}`);
for (const r of reports.slice(0, 20)) console.log(r);
if (missing > 0) {
	console.log("FAIL");
	process.exit(1);
}
console.log("OK (no missing cells; disconnections may still cause faint outlines)");
