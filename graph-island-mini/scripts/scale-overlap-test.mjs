// Verify that scaled cards (variable nodeSizeMode) don't overlap.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-scale-"));
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

// 8 nodes in one cluster with varied sizes (simulating scaled by linkCount).
const data = {
	nodes: [
		{ id: "h/big.md", label: "hub", memberships: ["A"] }, // 5x size
		{ id: "m/mid.md", label: "mid", memberships: ["A"] }, // 3x
		{ id: "s/1.md", label: "s1", memberships: ["A"] },
		{ id: "s/2.md", label: "s2", memberships: ["A"] },
		{ id: "s/3.md", label: "s3", memberships: ["A"] },
		{ id: "s/4.md", label: "s4", memberships: ["A"] },
		{ id: "s/5.md", label: "s5", memberships: ["A"] },
		{ id: "s/6.md", label: "s6", memberships: ["A"] },
	],
	edges: [],
};

const SLOT_W = 136;
const SLOT_H = 36.267;
const CHANNEL_W = 16;
const CHANNEL_H = 4.267;

const sizes = [
	{ scale: 5 },
	{ scale: 3 },
	{ scale: 1 },
	{ scale: 1 },
	{ scale: 1 },
	{ scale: 1 },
	{ scale: 1 },
	{ scale: 1 },
];
const sized = data.nodes.map((n, i) => ({
	...n,
	width: sizes[i].scale * SLOT_W - CHANNEL_W,
	height: sizes[i].scale * SLOT_H - CHANNEL_H,
}));

const laid = layout(data, sized, {
	clusterSpacing: 48,
	nodeSpacing: 16,
	cellW: 120,
	cellH: 32,
});

console.log("After cell snap:");
laid.nodes.forEach((n, i) => {
	const sc = sizes[i].scale;
	const col = Math.round(n.x / SLOT_W - sc / 2);
	const row = Math.round(n.y / SLOT_H - sc / 2);
	console.log(
		`  ${n.id}: col=${col}..${col + sc - 1}, row=${row}..${row + sc - 1} (scale=${sc})`,
	);
});

// AABB overlap check
let overlaps = 0;
const pairs = [];
for (let i = 0; i < laid.nodes.length; i++) {
	for (let j = i + 1; j < laid.nodes.length; j++) {
		const a = laid.nodes[i];
		const b = laid.nodes[j];
		const aL = a.x - a.width / 2 + 0.5;
		const aR = a.x + a.width / 2 - 0.5;
		const aT = a.y - a.height / 2 + 0.5;
		const aB = a.y + a.height / 2 - 0.5;
		const bL = b.x - b.width / 2 + 0.5;
		const bR = b.x + b.width / 2 - 0.5;
		const bT = b.y - b.height / 2 + 0.5;
		const bB = b.y + b.height / 2 - 0.5;
		if (aL < bR && bL < aR && aT < bB && bT < aB) {
			overlaps++;
			pairs.push([a.id, b.id]);
		}
	}
}
if (overlaps > 0) {
	console.log(`FAIL: ${overlaps} overlaps`);
	for (const p of pairs) console.log(`  ${p[0]} <-> ${p[1]}`);
	process.exit(1);
}
console.log("OK no overlaps");
process.exit(0);
