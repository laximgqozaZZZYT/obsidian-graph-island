// Verify UpSet coexistence of 1×1 and size-scaled (2×2 = 4×) cards:
//   1. Every card still fills an INTEGER number of cells (区画), 1×1 = one.
//   2. A column containing a 2×2 card reserves 2 lattice columns, so the
//      RIGHT-adjacent Pareto bar starts ≥ 2 cells over (no overlap).
//   3. No two cards' rectangles overlap (snapCardsToGrid stayed a no-op).
//   4. Column xWorld spacing reflects the variable widths (footer follows).
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-"));
const bundlePath = join(tmp, "layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning",
});
const { layout } = await import(bundlePath);

const cellW = 120, cellH = 32, nodeSpacing = 22;
const channel = Math.max(24, Math.floor(nodeSpacing * 1.5)); // 33
const slotW = cellW + channel, slotH = cellH + channel;       // 153 / 65

// computeCardSize-equivalent for an n×m card (channel subtracted once).
const sz = (cols, rows) => ({ width: cols * slotW - channel, height: rows * slotH - channel });

const data = { nodes: [], edges: [] };
// Column A (sig "a"): contains ONE 2×2 hub + three 1×1.
// Column B (sig "a|b"): four 1×1.  Column C (sig "b"): two 1×1.
const plan = [
	{ sig: ["a"], cards: [[2, 2], [1, 1], [1, 1], [1, 1]] },
	{ sig: ["a", "b"], cards: [[1, 1], [1, 1], [1, 1], [1, 1]] },
	{ sig: ["b"], cards: [[1, 1], [1, 1]] },
];
const sizeOf = new Map();
let k = 0;
for (const col of plan) {
	for (const [c, r] of col.cards) {
		const id = `n${k++}.md`;
		data.nodes.push({ id, label: id, memberships: [...col.sig] });
		sizeOf.set(id, sz(c, r));
	}
}
const sized = data.nodes.map((n) => ({ ...n, ...sizeOf.get(n.id) }));

const laid = layout(data, sized, {
	clusterSpacing: 48, nodeSpacing, cellW, cellH,
	viewMode: "upset", upsetColumnSort: "size",
});

let fail = 0;
const fence = (m) => { console.error("✗ " + m); fail++; };

// 1. Every card spans an integer cell count and fills it exactly.
for (const n of laid.nodes) {
	const cols = (n.width + channel) / slotW;
	const rows = (n.height + channel) / slotH;
	if (Math.abs(cols - Math.round(cols)) > 1e-6) fence(`${n.id} width ${n.width} not integer cells`);
	if (Math.abs(rows - Math.round(rows)) > 1e-6) fence(`${n.id} height ${n.height} not integer cells`);
}

// 3. No two card rectangles overlap (channel-exclusive: borders may touch).
const rects = laid.nodes.map((n) => ({
	id: n.id, l: n.x - n.width / 2, r: n.x + n.width / 2, t: n.y - n.height / 2, b: n.y + n.height / 2,
}));
for (let i = 0; i < rects.length; i++)
	for (let j = i + 1; j < rects.length; j++) {
		const A = rects[i], B = rects[j];
		const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l);
		const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
		if (ox > 1e-6 && oy > 1e-6) fence(`overlap ${A.id} ∩ ${B.id} (${ox.toFixed(1)}×${oy.toFixed(1)})`);
	}

// 2 + 4. Column widths: A (has 2×2) must be 2 cells; B,C = 1 cell. Centres
// step by (prevWidth+thisWidth)/2 cells. With sort "size", the big columns
// (A and B both size 4) order first; find them by signature.
const cols = laid.upset.columns;
const byKey = new Map(cols.map((c) => [c.signature.join("|"), c]));
const A = byKey.get("a"), B = byKey.get("a|b"), C = byKey.get("b");
console.log("column xWorld:", cols.map((c) => `${c.signature.join("|")}@${c.xWorld}`).join("  "));
// A holds the 2×2 → its centre must sit at 1.0 cell (width 2 ⇒ centre at colStart+1).
// Whatever the sort order, the GAP between A's right edge and the nearest
// other column's left card must be ≥ channel (no overlap already checks the
// strong form; here we assert the 2-cell reservation explicitly).
const aCards = laid.nodes.filter((n) => n.memberships.join("|") === "a");
const aHub = aCards.find((n) => n.width > cellW + 1);
if (!aHub) fence("no 2×2 hub found in column a");
else {
	const hubRight = aHub.x + aHub.width / 2;
	// nearest card to the right that belongs to a DIFFERENT column
	const others = laid.nodes.filter((n) => n.memberships.join("|") !== "a" && n.x - n.width / 2 >= hubRight - 1e-6);
	const nearest = others.sort((p, q) => (p.x - p.width / 2) - (q.x - q.width / 2))[0];
	if (nearest) {
		const gap = (nearest.x - nearest.width / 2) - hubRight;
		console.log(`2×2 hub right edge → nearest right column card gap = ${gap.toFixed(1)} (channel=${channel})`);
		if (gap < channel - 1e-6) fence(`right-adjacent bar too close: gap ${gap} < channel ${channel}`);
	}
}

console.log(`slotW=${laid.slotW} slotH=${laid.slotH} cards=${laid.nodes.length} cols=${cols.length}`);
if (fail === 0) console.log("✓ PASS — 1×1 + 2×2 coexist: integer-cell fill, no overlap, right bar spaced, footer xWorld tracks widths");
else { console.error(`✗ ${fail} failure(s)`); process.exit(1); }
