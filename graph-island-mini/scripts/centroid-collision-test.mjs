// Targeted failing test: 3 anchors on a line + sub-group {A,C} should collide
// with sub-group {B} unless layout offsets multi-membership sub-groups.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-collision-"));
const bundlePath = join(tmp, "layout.cjs");

await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	outfile: bundlePath,
	logLevel: "warning",
});

const { layout } = await import(bundlePath);

// 4 clusters A/B/C/D on 2x2 grid:
//   A=(0,0)  B=(S,0)
//   C=(0,S)  D=(S,S)
// midpoint(A,D) = (S/2, S/2) = midpoint(B,C) — SAME POINT.
// Sub-groups {A,D} and {B,C} both pack at the centre → cards overlap.
const data = {
	nodes: [
		{ id: "a/0.md", label: "a0", memberships: ["A"] },
		{ id: "a/1.md", label: "a1", memberships: ["A"] },
		{ id: "b/0.md", label: "b0", memberships: ["B"] },
		{ id: "b/1.md", label: "b1", memberships: ["B"] },
		{ id: "c/0.md", label: "c0", memberships: ["C"] },
		{ id: "c/1.md", label: "c1", memberships: ["C"] },
		{ id: "d/0.md", label: "d0", memberships: ["D"] },
		{ id: "d/1.md", label: "d1", memberships: ["D"] },
		// Coincident-centroid sub-groups:
		{ id: "ad/0.md", label: "ad0", memberships: ["A", "D"] },
		{ id: "ad/1.md", label: "ad1", memberships: ["A", "D"] },
		{ id: "bc/0.md", label: "bc0", memberships: ["B", "C"] },
		{ id: "bc/1.md", label: "bc1", memberships: ["B", "C"] },
	],
	edges: [],
};

const sized = data.nodes.map((n) => ({ ...n, width: 100, height: 40 }));
const laid = layout(data, sized, { clusterSpacing: 48, nodeSpacing: 16, cellW: 100, cellH: 40 });

console.log(`Nodes positioned: ${laid.nodes.length}`);
console.log(`Clusters: ${laid.clusters.map((c) => c.groupKey).join(", ")}`);

// Detect AABB overlaps between any pair of cards
let overlaps = 0;
const overlapPairs = [];
for (let i = 0; i < laid.nodes.length; i++) {
	for (let j = i + 1; j < laid.nodes.length; j++) {
		const a = laid.nodes[i], b = laid.nodes[j];
		const aL = a.x - a.width / 2 + 0.1;
		const aR = a.x + a.width / 2 - 0.1;
		const aT = a.y - a.height / 2 + 0.1;
		const aB = a.y + a.height / 2 - 0.1;
		const bL = b.x - b.width / 2 + 0.1;
		const bR = b.x + b.width / 2 - 0.1;
		const bT = b.y - b.height / 2 + 0.1;
		const bB = b.y + b.height / 2 - 0.1;
		if (aL < bR && bL < aR && aT < bB && bT < aB) {
			overlaps++;
			overlapPairs.push([a.id, b.id, a.x.toFixed(0), a.y.toFixed(0), b.x.toFixed(0), b.y.toFixed(0)]);
		}
	}
}

if (overlaps > 0) {
	console.log(`FAIL: ${overlaps} card AABB overlaps`);
	for (const p of overlapPairs.slice(0, 10)) {
		console.log(`  ${p[0]} (${p[2]},${p[3]}) <-> ${p[1]} (${p[4]},${p[5]})`);
	}
	process.exit(1);
}
console.log("OK no overlaps");
process.exit(0);
