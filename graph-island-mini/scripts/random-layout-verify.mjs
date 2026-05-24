// Randomised stress test for cluster-polygon invariants.
//
// Generates random layout scenarios (group count, per-group member
// count, per-node membership combinations all chosen by a seeded PRNG)
// and checks the three "違反" rules the user specified:
//
//   V1. A node sits inside a cluster's polygon WITHOUT having that
//       cluster in its memberships (= foreign-in-enclosure).
//   V2. A cluster's polygon has more than one 4-connected component
//       (= non-wrap exclave; wrap exclaves come from view.ts tile
//       rendering, which sits ABOVE this verifier's data source).
//   V3. A node belongs to some cluster but its cell is NOT inside
//       that cluster's polygon (= missing-from-own-enclosure).
//
// Output: per-trial summary. Exits non-zero if any trial violates.
// Seeds are deterministic so a failing trial can be re-run by passing
// SEED=<n> on the command line.
//
// Modes (env vars):
//   default      30 trials, ≤ 20 groups, ≤ 50 members/group
//   STRESS=1    100 trials, ≤ 100 groups, ≤ 200 members/group
//   MEGA=1       10 trials, ≤ 1000 groups, ≤ 50 members/group
//
// (The user-suggested upper bound of 100000 groups is intentionally
// rejected — building that many cards routinely OOMs Node and
// blows past test-runner timeouts. MEGA mode caps at 1000 which is
// still 50× larger than typical real vaults.)

import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-rand-"));

const layoutBundle = join(tmp, "layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true, platform: "node", format: "cjs",
	outfile: layoutBundle, logLevel: "warning",
});
const { layout } = await import(layoutBundle);

const cbBundle = join(tmp, "cluster-bbox.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/cluster-bbox.ts")],
	bundle: true, platform: "node", format: "cjs",
	outfile: cbBundle, logLevel: "warning",
});
const { computeClusterOwnedCells } = await import(cbBundle);

// ─── Seeded PRNG (Mulberry32) ───
function makeRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rint = (r, lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo;
const rpick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ─── Scenario generator ───
function generateScenario(seed, opts) {
	const r = makeRng(seed);
	const groupCount = rint(r, opts.minGroups, opts.maxGroups);
	const groups = Array.from({ length: groupCount }, (_, i) => `g${i}`);
	const data = { nodes: [], edges: [] };
	const sized = [];
	let totalNodes = 0;
	for (const g of groups) {
		const count = rint(r, 0, opts.maxPerGroup);
		for (let i = 0; i < count; i++) {
			const id = `${g}_n${i}`;
			const memberships = new Set([g]);
			// Possibly add 0-N extra memberships drawn from other groups.
			const extraN = rint(r, 0, opts.maxExtraMemb);
			for (let k = 0; k < extraN; k++) {
				const other = rpick(r, groups);
				if (other !== g) memberships.add(other);
			}
			const memb = [...memberships];
			data.nodes.push({ id, label: id, memberships: memb });
			sized.push({ id, label: id, memberships: memb, width: 120, height: 32 });
			totalNodes++;
			if (totalNodes >= opts.maxTotalNodes) break;
		}
		if (totalNodes >= opts.maxTotalNodes) break;
	}
	return { data, sized, totalNodes, groupCount: groups.length };
}

// ─── Cell helpers ───
function cellOfNode(n, slotW, slotH) {
	// Match nodeFootprint: center coords → cell range.
	const colSpan = Math.max(1, Math.ceil(n.width / slotW));
	const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
	const startCol = Math.round(n.x / slotW - colSpan / 2);
	const startRow = Math.round(n.y / slotH - rowSpan / 2);
	const cells = [];
	for (let c = startCol; c < startCol + colSpan; c++) {
		for (let r = startRow; r < startRow + rowSpan; r++) {
			cells.push(`${c},${r}`);
		}
	}
	return cells;
}

function polygonCellSet(cluster, slotW, slotH, channelW, channelH) {
	const out = new Set();
	// Prefer the new `pieces` field (= multi-rect enclosure per user
	// spec 2026-05-24). Each piece is a pixel rect aligned to the slot
	// grid; convert to col/row range and add every cell it covers.
	if (cluster.pieces && cluster.pieces.length > 0) {
		const padX = channelW / 2;
		const padY = channelH / 2;
		for (const p of cluster.pieces) {
			// Pixel rect → cell range. piece.x = col*slotW + padX, so
			// col = (piece.x - padX) / slotW.
			const c0 = Math.round((p.x - padX) / slotW);
			const r0 = Math.round((p.y - padY) / slotH);
			const cN = Math.round((p.x + p.w - padX) / slotW) - 1;
			const rN = Math.round((p.y + p.h - padY) / slotH) - 1;
			for (let c = c0; c <= cN; c++) {
				for (let r = r0; r <= rN; r++) {
					out.add(`${c},${r}`);
				}
			}
		}
		return out;
	}
	// Legacy fallback: cells field.
	if (cluster.cells) {
		for (const r of cluster.cells) {
			const col = Math.round(r.x / slotW);
			const row = Math.round(r.y / slotH);
			out.add(`${col},${row}`);
		}
	}
	return out;
}

function components4(cells) {
	const seen = new Set();
	let comps = 0;
	for (const start of cells) {
		if (seen.has(start)) continue;
		comps++;
		const q = [start];
		seen.add(start);
		while (q.length) {
			const cur = q.shift();
			const [c, r] = cur.split(",").map(Number);
			for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const k = `${c + dc},${r + dr}`;
				if (cells.has(k) && !seen.has(k)) {
					seen.add(k);
					q.push(k);
				}
			}
		}
	}
	return comps;
}

// ─── Verifier ───
function verifyScenario(seed, scenario, laid) {
	const slotW = laid.slotW;
	const slotH = laid.slotH;
	const channelW = laid.channelW;
	const channelH = laid.channelH;
	const violations = [];
	// User spec 2026-05-24: cluster enclosure may consist of MULTIPLE
	// rectangular pieces (= 離れ島 OK). Per-cluster polygon = union of
	// pieces. Multiple ClusterRect entries with the same groupKey would
	// also be unioned (currently the orchestrator produces one entry
	// per cluster with all pieces inside; the union code handles both).
	const polyByCluster = new Map();
	for (const c of laid.clusters) {
		const existing = polyByCluster.get(c.groupKey) ?? new Set();
		const piece = polygonCellSet(c, slotW, slotH, channelW, channelH);
		for (const k of piece) existing.add(k);
		polyByCluster.set(c.groupKey, existing);
	}

	// V1 + V3: per-node check
	for (const n of laid.nodes) {
		const cells = cellOfNode(n, slotW, slotH);
		const memberships = new Set(n.memberships);
		for (const [key, poly] of polyByCluster) {
			const inPolygon = cells.some((k) => poly.has(k));
			const isMember = memberships.has(key);
			if (inPolygon && !isMember) {
				violations.push({
					rule: "V1",
					detail: `seed=${seed} node=${n.id} (memb=${[...memberships].join(",")}) sits in foreign cluster ${key} polygon at cells [${cells.join("|")}]`,
				});
			}
			if (!inPolygon && isMember) {
				violations.push({
					rule: "V3",
					detail: `seed=${seed} node=${n.id} (memb=${[...memberships].join(",")}) is NOT inside own cluster ${key} polygon (cells=[${cells.join("|")}], poly cells=${poly.size})`,
				});
			}
		}
	}

	// V2: exclaves are explicitly ALLOWED under the current user spec
	// ("離れ島は許容する"). No connectivity check is performed.

	return violations;
}

// ─── Modes ───
const mode = process.env.MEGA
	? "mega"
	: process.env.STRESS
		? "stress"
		: "default";
const presets = {
	default: { trials: 30, minGroups: 1, maxGroups: 20, maxPerGroup: 50, maxExtraMemb: 3, maxTotalNodes: 1000 },
	stress: { trials: 100, minGroups: 1, maxGroups: 100, maxPerGroup: 200, maxExtraMemb: 5, maxTotalNodes: 5000 },
	mega: { trials: 10, minGroups: 50, maxGroups: 1000, maxPerGroup: 50, maxExtraMemb: 3, maxTotalNodes: 10000 },
};
const opts = presets[mode];
console.log(`Mode: ${mode}`);
console.log(`Trials: ${opts.trials}, groups: ${opts.minGroups}-${opts.maxGroups}, members/group: 0-${opts.maxPerGroup}, extra memb: 0-${opts.maxExtraMemb}, total cap: ${opts.maxTotalNodes}`);

// If a specific SEED is supplied, run only that.
const fixedSeed = process.env.SEED !== undefined ? parseInt(process.env.SEED, 10) : null;
const seeds = fixedSeed !== null
	? [fixedSeed]
	: Array.from({ length: opts.trials }, (_, i) => i + 1);

let totalViolations = 0;
let trialsRun = 0;
let trialsWithViolations = 0;
const violationRuleCounts = { V1: 0, V2: 0, V3: 0 };
const reportedSamples = [];

for (const seed of seeds) {
	const scenario = generateScenario(seed, opts);
	if (scenario.totalNodes === 0) {
		// Empty scenario produces no clusters; trivially OK.
		console.log(`  seed=${seed}: empty (groups=${scenario.groupCount}) — skip`);
		continue;
	}
	trialsRun++;
	let laid;
	try {
		laid = layout(scenario.data, scenario.sized, {
			clusterSpacing: 80,
			nodeSpacing: 16,
			cellW: 120,
			cellH: 32,
		});
	} catch (e) {
		console.log(`  seed=${seed}: LAYOUT THREW: ${e.message}`);
		totalViolations++;
		continue;
	}
	const v = verifyScenario(seed, scenario, laid);
	totalViolations += v.length;
	if (v.length > 0) {
		trialsWithViolations++;
		for (const item of v) {
			violationRuleCounts[item.rule] = (violationRuleCounts[item.rule] ?? 0) + 1;
			if (reportedSamples.length < 20) reportedSamples.push(item);
		}
		console.log(`  seed=${seed}: nodes=${scenario.totalNodes}, groups=${scenario.groupCount}, clusters=${laid.clusters.length}, VIOLATIONS=${v.length}`);
	} else {
		console.log(`  seed=${seed}: nodes=${scenario.totalNodes}, groups=${scenario.groupCount}, clusters=${laid.clusters.length}, OK`);
	}
}

console.log(`\nSummary:`);
console.log(`  trials run: ${trialsRun}`);
console.log(`  trials with violations: ${trialsWithViolations}`);
console.log(`  total violations: ${totalViolations}`);
console.log(`    V1 (foreign-in-enclosure): ${violationRuleCounts.V1 ?? 0}`);
console.log(`    V2 (non-wrap exclave): ${violationRuleCounts.V2 ?? 0}`);
console.log(`    V3 (missing from own enclosure): ${violationRuleCounts.V3 ?? 0}`);

if (reportedSamples.length > 0) {
	console.log(`\nSample violations (first ${reportedSamples.length}):`);
	for (const s of reportedSamples) {
		console.log(`  [${s.rule}] ${s.detail.slice(0, 240)}`);
	}
}

if (totalViolations > 0) {
	console.log(`\nFAIL: ${totalViolations} invariant violations across ${trialsWithViolations} trial(s).`);
	console.log(`Re-run a single trial with: SEED=<n> node scripts/random-layout-verify.mjs`);
	process.exit(1);
}
console.log(`\nOK: all ${trialsRun} trials satisfied V1/V2/V3.`);
