// Smoke test for layout(): builds a tiny fake graph and asserts that
// inter-cluster edge paths start at the source node and end at the target node.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const tmp = mkdtempSync(join(tmpdir(), "gim-"));
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

// Four clusters × 9 nodes each, with several inter-cluster edges. Sprinkle in
// a few multi-membership files so the Euler-style layout gets exercised.
const data = { nodes: [], edges: [] };
const groups = ["a", "b", "c", "d"];
for (const g of groups) {
	for (let i = 0; i < 9; i++) {
		data.nodes.push({ id: `${g}/${i}.md`, label: `${i}`, memberships: [g] });
	}
}
// Three multi-membership files: in a+b, in b+c, in a+c+d
data.nodes.find((n) => n.id === "a/0.md").memberships = ["a", "b"];
data.nodes.find((n) => n.id === "b/3.md").memberships = ["b", "c"];
data.nodes.find((n) => n.id === "c/2.md").memberships = ["a", "c", "d"];
// Inter edges going every which way
const interPairs = [
	["a/0.md", "b/8.md"], ["a/4.md", "b/0.md"], ["a/8.md", "d/0.md"],
	["b/3.md", "c/5.md"], ["c/2.md", "d/7.md"], ["d/4.md", "a/2.md"],
	["c/0.md", "a/8.md"], ["b/8.md", "d/8.md"], ["a/6.md", "c/3.md"],
];
for (const [s, t] of interPairs) data.edges.push({ source: s, target: t });
// Plus a couple intra edges
data.edges.push({ source: "a/0.md", target: "a/8.md" });
data.edges.push({ source: "c/1.md", target: "c/7.md" });

// Variable-size cards: simulate measured dimensions like view.ts would produce.
// Three different size profiles so the shelf-pack and routing exercise mixed
// card geometries.
const sizeProfiles = [
	{ width: 80, height: 28 },
	{ width: 120, height: 44 },
	{ width: 160, height: 60 },
];
const sized = data.nodes.map((n, i) => ({ ...n, ...sizeProfiles[i % sizeProfiles.length] }));

const laid = layout(data, sized, {
	clusterSpacing: 48,
	nodeSpacing: 16,
});

const idToPos = new Map(laid.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
const memOf = new Map(laid.nodes.map((n) => [n.id, n.memberships]));

// Axis-aligned: returns true when segment a→b passes through n's interior
// (the card rectangle). Edges may touch a node's edge (= card border) but not
// cross into the body.
function segHitsNode(a, b, n, eps = 0.01) {
	const halfW = n.width / 2 - eps;
	const halfH = n.height / 2 - eps;
	const left = n.x - halfW, right = n.x + halfW;
	const top = n.y - halfH, bottom = n.y + halfH;
	if (Math.abs(a.x - b.x) < 0.01) {
		// vertical segment at x = a.x
		if (a.x <= left || a.x >= right) return false;
		const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
		return y1 > top && y0 < bottom;
	}
	if (Math.abs(a.y - b.y) < 0.01) {
		// horizontal segment at y = a.y
		if (a.y <= top || a.y >= bottom) return false;
		const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
		return x1 > left && x0 < right;
	}
	return false; // non-orthogonal — reported separately by isOrtho check
}
function isOrtho(a, b) {
	return Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
}

let pass = true;
let interHits = 0, intraHits = 0, nonOrtho = 0, totalSegs = 0;
for (const e of laid.edges) {
	const sm = memOf.get(e.source) ?? [];
	const tm = memOf.get(e.target) ?? [];
	const isIntra = sm.some((m) => tm.includes(m));
	const sp = idToPos.get(e.source);
	const tp = idToPos.get(e.target);
	const p0 = e.path[0];
	const pN = e.path[e.path.length - 1];
	const d0 = Math.hypot(p0.x - sp.x, p0.y - sp.y);
	const dN = Math.hypot(pN.x - tp.x, pN.y - tp.y);
	if (d0 > 0.5 || dN > 0.5) {
		console.log(`FAIL endpoints ${e.source}->${e.target}: dStart=${d0.toFixed(2)}, dEnd=${dN.toFixed(2)}`);
		pass = false;
	}
	for (let i = 1; i < e.path.length; i++) {
		totalSegs++;
		const a = e.path[i - 1], b = e.path[i];
		if (!isOrtho(a, b)) {
			nonOrtho++;
			console.log(`FAIL non-ortho seg ${e.source}->${e.target} idx=${i}: ${JSON.stringify(a)}->${JSON.stringify(b)}`);
			pass = false;
		}
		for (const n of laid.nodes) {
			if (n.id === e.source || n.id === e.target) continue;
			if (segHitsNode(a, b, n)) {
				if (isIntra) intraHits++; else interHits++;
			}
		}
	}
}
// Structural invariants (endpoints + ortho-only) must hold. Card-body hits are
// expected with variable-size cards and simple orthogonal routing; we report
// them as a quality signal but don't fail the build for them.
console.log(`segs=${totalSegs} nonOrtho=${nonOrtho} interHits=${interHits} intraHits=${intraHits}`);
console.log(pass ? "OK (structural)" : "FAIL (structural)");
process.exit(pass ? 0 : 1);
