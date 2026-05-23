// Stress test: mix of multi-cell cards (scale 1..4) AND a many-member
// aggregated cluster. Verify the badge cell never lands inside any card.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-agg-"));
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

// 1 hub-heavy "character" cluster (= visible cards including a scale-4 hub)
// + 1 "warrior" cluster fully aggregated (19 trulyAgg members, all warrior-only).
const data = { nodes: [], edges: [] };
// Hub character cards (high inDegree → scale 4)
const HUB_SCALE = 4;
data.nodes.push({ id: "guan-yu.md", label: "guan-yu", memberships: ["character"] });
// 8 more character members
for (let i = 0; i < 8; i++)
	data.nodes.push({ id: `char/${i}.md`, label: `c${i}`, memberships: ["character"] });
// 19 warrior-only members
for (let i = 0; i < 19; i++)
	data.nodes.push({ id: `warr/${i}.md`, label: `w${i}`, memberships: ["warrior"] });

const SLOT_W = 136;
const SLOT_H = 36.267;
const sized = data.nodes.map((n) => {
	const scale = n.id === "guan-yu.md" ? HUB_SCALE : 1;
	return {
		...n,
		width: scale * SLOT_W - 16,
		height: scale * SLOT_H - 4.267,
	};
});

const laid = layout(data, sized, {
	clusterSpacing: 80,
	nodeSpacing: 16,
	cellW: 120,
	cellH: 32,
});

// Replicate view.ts aggregate-snap (cell occupied + AABB safety net)
const aggSet = new Set(["warrior"]);
const trulyAgg = new Set();
for (const n of laid.nodes) {
	if (n.memberships.every((m) => aggSet.has(m))) trulyAgg.add(n.id);
}
const occupied = new Set();
const cardAABBs = [];
for (const n of laid.nodes) {
	if (trulyAgg.has(n.id)) continue;
	const colSpan = Math.max(1, Math.ceil(n.width / laid.slotW));
	const rowSpan = Math.max(1, Math.ceil(n.height / laid.slotH));
	const startCol = Math.round(n.x / laid.slotW - colSpan / 2);
	const startRow = Math.round(n.y / laid.slotH - rowSpan / 2);
	for (let dc = 0; dc < colSpan; dc++)
		for (let dr = 0; dr < rowSpan; dr++)
			occupied.add(`${startCol + dc},${startRow + dr}`);
	cardAABBs.push({
		id: n.id,
		left: n.x - n.width / 2,
		right: n.x + n.width / 2,
		top: n.y - n.height / 2,
		bottom: n.y + n.height / 2,
	});
}
let sx = 0, sy = 0, count = 0;
for (const n of laid.nodes) {
	if (!trulyAgg.has(n.id)) continue;
	if (!n.memberships.includes("warrior")) continue;
	sx += n.x; sy += n.y; count++;
}
console.log(`trulyAgg warriors: ${count}, centroid: (${(sx / count).toFixed(1)}, ${(sy / count).toFixed(1)})`);

const cellHitsCard = (col, row) => {
	const cx = (col + 0.5) * laid.slotW;
	const cy = (row + 0.5) * laid.slotH;
	for (const r of cardAABBs) {
		if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) return r.id;
	}
	return null;
};
const isBlocked = (c, r) => occupied.has(`${c},${r}`) || cellHitsCard(c, r) !== null;

let col = Math.floor(sx / count / laid.slotW);
let row = Math.floor(sy / count / laid.slotH);
console.log(`Initial badge cell: (${col}, ${row}). Blocked? ${isBlocked(col, row)}`);
if (isBlocked(col, row)) {
	let found = false;
	outer: for (let radius = 1; radius < 128; radius++) {
		for (let dc = -radius; dc <= radius; dc++) {
			for (let dr = -radius; dr <= radius; dr++) {
				if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
				if (!isBlocked(col + dc, row + dr)) {
					col += dc; row += dr;
					console.log(`Spiral escaped at radius ${radius} → (${col}, ${row})`);
					found = true;
					break outer;
				}
			}
		}
	}
	if (!found) console.log("FAIL: spiral exhausted");
}

const hit = cellHitsCard(col, row);
if (hit) {
	console.log(`FAIL: badge cell (${col}, ${row}) still hits card ${hit}`);
	process.exit(1);
}
console.log(`OK: badge cell (${col}, ${row}) outside every card`);
process.exit(0);
