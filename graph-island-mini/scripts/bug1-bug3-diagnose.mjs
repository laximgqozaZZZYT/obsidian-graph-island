// Diagnostic test for Bug #1 (group members spread abnormally far)
// and Bug #3 (unrelated nodes inside cluster enclosure).
//
// Output: for each test scenario, per-cluster spread + non-member
// count inside the bbox.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-diag-"));
const bundlePath = join(tmp, "layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning",
});
const { layout } = await import(bundlePath);

// Build a 5-cluster scene with multi-tag intersections.
function buildScene1() {
	const data = { nodes: [], edges: [] };
	const tags = ["scene", "talk", "drama", "character", "concept"];
	for (let i = 0; i < 15; i++) data.nodes.push({ id: `s/${i}.md`, label: `s${i}`, memberships: ["scene"] });
	for (const t of tags.slice(1)) {
		for (let i = 0; i < 4; i++) data.nodes.push({ id: `s${t}/${i}.md`, label: `s${t}${i}`, memberships: ["scene", t] });
	}
	for (const t of tags.slice(1)) {
		for (let i = 0; i < 10; i++) data.nodes.push({ id: `${t}/${i}.md`, label: `${t}${i}`, memberships: [t] });
	}
	return { data, tags };
}

// 3-cluster scene with heavy overlap (every node belongs to 2 clusters).
function buildScene2() {
	const data = { nodes: [], edges: [] };
	const tags = ["A", "B", "C"];
	for (let i = 0; i < 8; i++) data.nodes.push({ id: `ab/${i}.md`, label: `ab${i}`, memberships: ["A", "B"] });
	for (let i = 0; i < 8; i++) data.nodes.push({ id: `bc/${i}.md`, label: `bc${i}`, memberships: ["B", "C"] });
	for (let i = 0; i < 8; i++) data.nodes.push({ id: `ac/${i}.md`, label: `ac${i}`, memberships: ["A", "C"] });
	for (let i = 0; i < 5; i++) data.nodes.push({ id: `a/${i}.md`, label: `a${i}`, memberships: ["A"] });
	for (let i = 0; i < 5; i++) data.nodes.push({ id: `b/${i}.md`, label: `b${i}`, memberships: ["B"] });
	for (let i = 0; i < 5; i++) data.nodes.push({ id: `c/${i}.md`, label: `c${i}`, memberships: ["C"] });
	return { data, tags };
}

// 2-cluster scene with sparse single-tag + dense multi-tag.
function buildScene3() {
	const data = { nodes: [], edges: [] };
	const tags = ["X", "Y"];
	for (let i = 0; i < 3; i++) data.nodes.push({ id: `x/${i}.md`, label: `x${i}`, memberships: ["X"] });
	for (let i = 0; i < 3; i++) data.nodes.push({ id: `y/${i}.md`, label: `y${i}`, memberships: ["Y"] });
	for (let i = 0; i < 15; i++) data.nodes.push({ id: `xy/${i}.md`, label: `xy${i}`, memberships: ["X", "Y"] });
	return { data, tags };
}

function nodeFootprintCells(n, slotW, slotH) {
	const x = n.x, y = n.y, w = n.width, h = n.height;
	const left = x - w / 2;
	const top = y - h / 2;
	const right = x + w / 2;
	const bottom = y + h / 2;
	const startCol = Math.floor(left / slotW + 0.5);
	const endCol = Math.ceil(right / slotW - 0.5);
	const startRow = Math.floor(top / slotH + 0.5);
	const endRow = Math.ceil(bottom / slotH - 0.5);
	const out = [];
	for (let c = startCol; c <= endCol; c++) {
		for (let r = startRow; r <= endRow; r++) out.push(`${c},${r}`);
	}
	return out;
}

function analyse(label, build) {
	const { data, tags } = build();
	const sized = data.nodes.map((n) => ({ ...n, width: 120, height: 32 }));
	const laid = layout(data, sized, { clusterSpacing: 80, nodeSpacing: 16, cellW: 120, cellH: 32 });

	// Per-cluster diagnosis.
	console.log(`\n========== ${label} ==========`);
	for (const tag of tags) {
		const members = laid.nodes.filter((n) => n.memberships.includes(tag));
		const memberIds = new Set(members.map(m => m.id));
		if (members.length === 0) continue;

		// Bug 1 measure: pairwise centroid spread (max distance between
		// any two members of this cluster, in cells).
		let maxDist = 0;
		const colOf = new Map();
		const rowOf = new Map();
		for (const m of members) {
			colOf.set(m.id, m.x / laid.slotW);
			rowOf.set(m.id, m.y / laid.slotH);
		}
		for (let i = 0; i < members.length; i++) {
			for (let j = i + 1; j < members.length; j++) {
				const a = members[i], b = members[j];
				const dc = colOf.get(a.id) - colOf.get(b.id);
				const dr = rowOf.get(a.id) - rowOf.get(b.id);
				const d = Math.hypot(dc, dr);
				if (d > maxDist) maxDist = d;
			}
		}

		// Cluster bbox (cells the cluster bbox covers).
		const cl = laid.clusters.find(c => c.groupKey === tag);
		if (!cl) {
			console.log(`  ${tag}: ${members.length} members, max pairwise distance = ${maxDist.toFixed(2)} cells, NO CLUSTER RECT`);
			continue;
		}
		const bboxCellsCovered = new Set();
		const colStart = Math.floor(cl.x / laid.slotW + 0.001);
		const colEnd = Math.ceil((cl.x + cl.width) / laid.slotW - 0.001);
		const rowStart = Math.floor(cl.y / laid.slotH + 0.001);
		const rowEnd = Math.ceil((cl.y + cl.height) / laid.slotH - 0.001);
		for (let c = colStart; c < colEnd; c++) {
			for (let r = rowStart; r < rowEnd; r++) bboxCellsCovered.add(`${c},${r}`);
		}

		// Cells occupied by ANY card inside the cluster bbox
		let memberCells = 0;
		let nonMemberCells = 0;
		const nonMemberCards = new Set();
		for (const n of laid.nodes) {
			const fp = nodeFootprintCells(n, laid.slotW, laid.slotH);
			for (const cell of fp) {
				if (!bboxCellsCovered.has(cell)) continue;
				if (memberIds.has(n.id)) memberCells++;
				else { nonMemberCells++; nonMemberCards.add(n.id); }
			}
		}

		const bboxArea = bboxCellsCovered.size;
		console.log(`  ${tag}: ${members.length} members, max pairwise dist = ${maxDist.toFixed(1)} cells`);
		console.log(`    bbox=${colEnd-colStart}×${rowEnd-rowStart} (${bboxArea} cells), member-cells=${memberCells}, NON-member-cells=${nonMemberCells} (in ${nonMemberCards.size} foreign cards)`);
	}
}

analyse("Scene 1: 5 clusters (scene-hub)", buildScene1);
analyse("Scene 2: 3 clusters (heavy intersection)", buildScene2);
analyse("Scene 3: 2 clusters (sparse single, dense multi)", buildScene3);
