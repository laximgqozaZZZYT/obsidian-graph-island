// Broader overlap test: 9 clusters on a 3x3 grid with multiple multi-membership
// sub-groups, including 3-way intersections. Stress-tests the hash-offset fix.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-broad-"));
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

// 9 single-membership clusters + diverse multi-membership sub-groups
const tags = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const data = { nodes: [], edges: [] };
let idCounter = 0;
const add = (memberships) => {
	for (let i = 0; i < 2; i++) {
		data.nodes.push({
			id: `n${idCounter++}.md`,
			label: `${memberships.join("+")}-${i}`,
			memberships: [...memberships],
		});
	}
};

// Single-membership clusters
for (const t of tags) add([t]);
// Diagonal & symmetric pairs (likely centroid collisions)
add(["A", "I"]); // corner-to-corner = center
add(["C", "G"]); // anti-diagonal = center
add(["B", "H"]); // vertical line midpoint
add(["D", "F"]); // horizontal line midpoint
add(["A", "C"]); // top row endpoints
add(["G", "I"]); // bottom row endpoints
add(["A", "G"]); // left column endpoints
add(["C", "I"]); // right column endpoints
add(["A", "B", "C"]); // top row triple
add(["A", "E", "I"]); // diagonal triple
add(["A", "B", "D", "E"]); // top-left quad
add(["B", "D", "F", "H"]); // cross pattern → center

const sized = data.nodes.map((n) => ({ ...n, width: 100, height: 40 }));
const laid = layout(data, sized, { clusterSpacing: 48, nodeSpacing: 16 });

console.log(`Nodes positioned: ${laid.nodes.length}`);

// Detect AABB overlaps between any pair of cards
let overlaps = 0;
const overlapPairs = [];
for (let i = 0; i < laid.nodes.length; i++) {
	for (let j = i + 1; j < laid.nodes.length; j++) {
		const a = laid.nodes[i], b = laid.nodes[j];
		const ovX = a.x - a.width / 2 < b.x + b.width / 2 - 0.1
			&& b.x - b.width / 2 < a.x + a.width / 2 - 0.1;
		const ovY = a.y - a.height / 2 < b.y + b.height / 2 - 0.1
			&& b.y - b.height / 2 < a.y + a.height / 2 - 0.1;
		if (ovX && ovY) {
			overlaps++;
			overlapPairs.push([
				a.id, a.memberships.join("+"),
				b.id, b.memberships.join("+"),
				a.x.toFixed(0), a.y.toFixed(0),
				b.x.toFixed(0), b.y.toFixed(0),
			]);
		}
	}
}

if (overlaps > 0) {
	console.log(`FAIL: ${overlaps} card overlaps`);
	for (const p of overlapPairs.slice(0, 12)) {
		console.log(`  ${p[1]} (${p[4]},${p[5]}) <-> ${p[3]} (${p[6]},${p[7]})`);
	}
	process.exit(1);
}
console.log("OK no overlaps");
process.exit(0);
