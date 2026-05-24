// Smoke test for region-layout (new Phase A-F orchestrator).
// Builds a small 3-cluster scene + intersections and verifies that:
//   1. regionLayout returns set rects for every base set
//   2. Zones with count > 0 have non-empty intersection rects (Phase E
//      should have moved overlapping sets so they actually overlap)
//   3. Helly-forced zones are tagged (any triple of pairwise-overlapping
//      sets with count=0 should be detected)
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-region-"));
const bundlePath = join(tmp, "region-layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/region-layout.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	outfile: bundlePath,
	logLevel: "warning",
});
const mod = await import(bundlePath);
const { regionLayout } = mod;

// Scene: 3 clusters X, Y, Z with pairwise intersections.
const nodes = [];
const sized = [];
const mkNode = (id, memb) => {
	nodes.push({ id, label: id, memberships: memb });
	sized.push({ id, label: id, memberships: memb, width: 120, height: 32 });
};
for (let i = 0; i < 5; i++) mkNode(`x/${i}.md`, ["X"]);
for (let i = 0; i < 5; i++) mkNode(`y/${i}.md`, ["Y"]);
for (let i = 0; i < 5; i++) mkNode(`z/${i}.md`, ["Z"]);
for (let i = 0; i < 3; i++) mkNode(`xy/${i}.md`, ["X", "Y"]);
for (let i = 0; i < 3; i++) mkNode(`yz/${i}.md`, ["Y", "Z"]);
for (let i = 0; i < 3; i++) mkNode(`xz/${i}.md`, ["X", "Z"]);
// Note: no XYZ node — so {X,Y,Z} count=0 but should be Helly-forced
// because all pairs (X,Y), (Y,Z), (X,Z) overlap.

const result = regionLayout(nodes, sized, new Set(), {
	cardW: 120,
	cardH: 32,
	maxOuterIter: 3,
	maxInnerIter: 30,
});

let ok = true;
function check(cond, msg) {
	if (!cond) {
		console.log("FAIL: " + msg);
		ok = false;
	}
}

check(result.setRects.size === 3, `set rects size = ${result.setRects.size}, expected 3`);
for (const k of ["X", "Y", "Z"]) {
	const r = result.setRects.get(k);
	check(r !== undefined, `rect for ${k} present`);
	if (r) check(r.w > 0 && r.h > 0, `rect ${k} has positive area (${r.w}×${r.h})`);
}

// Helly check: {X,Y,Z} should be detected as Helly-forced (or already realised).
const xyzZone = result.zones.find((z) => z.key === "X|Y|Z");
check(xyzZone !== undefined, `zone {X,Y,Z} present (Helly-forced)`);
if (xyzZone) {
	check(xyzZone.isHellyForced, `zone {X,Y,Z} flagged Helly-forced (count=${xyzZone.count}, flagged=${xyzZone.isHellyForced})`);
}

// Pairwise overlaps: rect X ∩ rect Y should be non-empty.
function rectsIntersect(a, b) {
	if (!a || !b) return false;
	const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	return ox > 0 && oy > 0;
}
const rX = result.setRects.get("X");
const rY = result.setRects.get("Y");
const rZ = result.setRects.get("Z");
check(rectsIntersect(rX, rY), `X ∩ Y rect non-empty (must overlap)`);
check(rectsIntersect(rY, rZ), `Y ∩ Z rect non-empty (must overlap)`);
check(rectsIntersect(rX, rZ), `X ∩ Z rect non-empty (must overlap)`);

console.log("Set rects:");
for (const [k, r] of result.setRects) {
	console.log(`  ${k}: x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.w.toFixed(1)}, h=${r.h.toFixed(1)}`);
}
console.log("Zones:");
for (const z of result.zones) {
	console.log(`  {${z.memberships.join(",")}}: count=${z.count}, hellyForced=${z.isHellyForced}`);
}

if (ok) console.log("OK");
else console.log("HAS FAILURES");
process.exit(ok ? 0 : 1);
