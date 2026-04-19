#!/usr/bin/env node
// check-dead-exports.mjs — Gate against dead-export regressions.
//
// Runs `knip` and counts unused exports + unused exported types under
// `src/`. Fails with exit 1 when the total exceeds THRESHOLD.
//
// Policy: **Ratchet down only**. THRESHOLD must never be raised. When the
// measured count drops meaningfully below THRESHOLD, lower THRESHOLD to
// lock in the improvement — same operating model as the bundle-size budget.
//
// Measured baseline (2026-04-19, after subtask-1 / C-category removals):
//   src/ unused exports=39, types=44  → total=83
// Expected post subtask-2,3 (barrel re-export cleanup): ~48
// THRESHOLD is set at the parent issue target (≤50).
//
// Rollout order: run standalone only until subtask-2,3 land. Wiring this
// into CI/lint pipelines before then would trip the gate on its own
// baseline (83 > 50). Enable in CI only after the measured total ≤ 50.
//
// Usage: node scripts/check-dead-exports.mjs

import { spawnSync } from "node:child_process";

const THRESHOLD = 50;

function runKnip() {
	const res = spawnSync("npx", ["--yes", "knip", "--reporter", "json"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	});
	if (res.error) throw new Error(`knip spawn failed: ${res.error.message}`);
	if (!res.stdout) {
		throw new Error(`knip failed: ${res.stderr?.trim() || "no output"}`);
	}
	return res.stdout;
}

function arrLen(v) {
	return Array.isArray(v) ? v.length : 0;
}

function parseSrcCounts(stdout) {
	const data = JSON.parse(stdout);
	const issues = Array.isArray(data?.issues) ? data.issues : [];
	const srcIssues = issues
		.filter((i) => typeof i?.file === "string" && i.file.startsWith("src/"))
		.map((i) => {
			const exports = arrLen(i.exports);
			const types = arrLen(i.types);
			return { file: i.file, exports, types, count: exports + types };
		});
	const exports = srcIssues.reduce((n, i) => n + i.exports, 0);
	const types = srcIssues.reduce((n, i) => n + i.types, 0);
	return { exports, types, total: exports + types, srcIssues };
}

function printTopOffenders(srcIssues) {
	const rows = srcIssues
		.filter((x) => x.count > 0)
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);
	if (rows.length === 0) return;
	console.error("  Top files:");
	for (const { file, count } of rows) {
		console.error(`    ${String(count).padStart(3)}  ${file}`);
	}
}

function main() {
	let stdout;
	try {
		stdout = runKnip();
	} catch (err) {
		console.error(err.message);
		process.exit(2);
	}

	let counts;
	try {
		counts = parseSrcCounts(stdout);
	} catch (err) {
		console.error(`Failed to parse knip JSON output: ${err.message}`);
		process.exit(2);
	}

	const { exports, types, total, srcIssues } = counts;
	const summary = `Dead exports (src/): ${total} (exports=${exports}, types=${types})`;

	if (total > THRESHOLD) {
		console.error(`OVER BUDGET: ${total} > ${THRESHOLD}`);
		console.error(summary);
		printTopOffenders(srcIssues);
		process.exit(1);
	}

	console.log(`OK: ${summary} (threshold=${THRESHOLD})`);
}

main();
