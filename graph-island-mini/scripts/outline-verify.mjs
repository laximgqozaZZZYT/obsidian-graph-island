// Verify closeToSimplyConnected: pass deliberately-disconnected owned
// cells through closeToSimplyConnected, then check the resulting cell
// set has (a) exactly 1 connected component (no exclaves), (b) no
// interior holes (= every non-cell inside AABB is reachable from
// outside).
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-outl-"));
const bundlePath = join(tmp, "cluster-bbox.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/cluster-bbox.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning",
});
const { closeToSimplyConnected } = await import(bundlePath);

function aabb(cells) {
	let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
	for (const k of cells) {
		const [c, r] = k.split(",").map(Number);
		if (c < minC) minC = c;
		if (c > maxC) maxC = c;
		if (r < minR) minR = r;
		if (r > maxR) maxR = r;
	}
	return { minCol: minC, maxCol: maxC, minRow: minR, maxRow: maxR };
}
function components4(cells) {
	const visited = new Set();
	const out = [];
	for (const start of cells) {
		if (visited.has(start)) continue;
		const comp = new Set([start]);
		visited.add(start);
		const q = [start];
		while (q.length) {
			const cur = q.shift();
			const [c, r] = cur.split(",").map(Number);
			for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const k = `${c + dc},${r + dr}`;
				if (cells.has(k) && !visited.has(k)) {
					visited.add(k);
					comp.add(k);
					q.push(k);
				}
			}
		}
		out.push(comp);
	}
	return out;
}
function findHoles(cells, range) {
	const reachable = new Set();
	const q = [];
	const seed = (c, r) => {
		const k = `${c},${r}`;
		if (cells.has(k) || reachable.has(k)) return;
		reachable.add(k);
		q.push([c, r]);
	};
	for (let c = range.minCol - 1; c <= range.maxCol + 1; c++) {
		seed(c, range.minRow - 1);
		seed(c, range.maxRow + 1);
	}
	for (let r = range.minRow - 1; r <= range.maxRow + 1; r++) {
		seed(range.minCol - 1, r);
		seed(range.maxCol + 1, r);
	}
	while (q.length) {
		const [c, r] = q.shift();
		for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nc = c + dc, nr = r + dr;
			if (nc < range.minCol - 1 || nc > range.maxCol + 1) continue;
			if (nr < range.minRow - 1 || nr > range.maxRow + 1) continue;
			const k = `${nc},${nr}`;
			if (cells.has(k) || reachable.has(k)) continue;
			reachable.add(k);
			q.push([nc, nr]);
		}
	}
	const holes = [];
	for (let c = range.minCol; c <= range.maxCol; c++) {
		for (let r = range.minRow; r <= range.maxRow; r++) {
			const k = `${c},${r}`;
			if (cells.has(k) || reachable.has(k)) continue;
			holes.push(k);
		}
	}
	return holes;
}

function test(label, cellsArr) {
	const owned = new Set(cellsArr);
	const range = aabb(owned);
	const closed = closeToSimplyConnected(owned, range);
	const comps = components4(closed);
	const holes = findHoles(closed, range);
	const ok = comps.length === 1 && holes.length === 0;
	console.log(`${ok ? "OK " : "FAIL"} ${label}: input=${owned.size}, closed=${closed.size}, comps=${comps.length}, holes=${holes.length}`);
	if (!ok) {
		console.log(`  closed cells: ${[...closed].sort().join(" ")}`);
		if (comps.length > 1) console.log(`  components: ${comps.map(c => c.size).join(", ")}`);
		if (holes.length > 0) console.log(`  holes: ${holes.join(" ")}`);
	}
}

// 1. Already connected, no holes
test("connected square 2x2", ["0,0", "0,1", "1,0", "1,1"]);
// 2. Two cells, 1 col apart
test("two cells 1col apart row0", ["0,0", "2,0"]);
// 3. Donut: 8 cells around a hole
test("donut", ["0,0", "1,0", "2,0", "0,1", "2,1", "0,2", "1,2", "2,2"]);
// 4. Four corners
test("four corners 4x4", ["0,0", "3,0", "0,3", "3,3"]);
// 5. L shape
test("L shape", ["0,0", "0,1", "0,2", "1,0", "2,0"]);
// 6. Two horizontal blocks separated
test("two 2x2 blocks separated", ["0,0", "1,0", "0,1", "1,1", "4,0", "5,0", "4,1", "5,1"]);
// 7. Random scattering
test("random scatter", ["0,0", "5,3", "2,7", "8,1", "3,5"]);
