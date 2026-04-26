#!/usr/bin/env node
// collect-verify-data.mjs — Run quality gates and write `.verify-data.json`.
//
// Usage:
//   node scripts/collect-verify-data.mjs
//
// Inputs: repo working tree (no args).
// Output: `.verify-data.json` (overwritten) at repo root with shape:
//   {
//     godObjects: [{file, current, max, diff, pass}],
//     lint: {pass},
//     format: {pass},
//     tests: {passed, failed, total},
//     coverage: {s, b, f, l}
//   }
//
// All shell-outs use spawnSync with argv arrays (no shell interpolation).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const OUTPUT = resolve(REPO_ROOT, ".verify-data.json");
const COVERAGE_SUMMARY = resolve(REPO_ROOT, "coverage", "coverage-summary.json");

const GOD_OBJECTS = [
	{ file: "src/views/GraphViewContainer.ts", max: 8597 },
	{ file: "src/views/PanelBuilder.ts", max: 2216 },
	{ file: "src/views/EdgeRenderer.ts", max: 2702 },
	{ file: "src/views/RenderPipeline.ts", max: 2321 },
];

function countLines(filePath) {
	const abs = resolve(REPO_ROOT, filePath);
	const src = readFileSync(abs, "utf8");
	if (src.length === 0) return 0;
	const trailingNewline = src.endsWith("\n") ? 0 : 1;
	return src.split("\n").length - 1 + trailingNewline;
}

function runPnpm(args) {
	const result = spawnSync("pnpm", args, {
		cwd: REPO_ROOT,
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	});
	const stdout = result.stdout ? result.stdout.toString("utf8") : "";
	const exitCode = result.status ?? 1;
	return { pass: exitCode === 0, exitCode, stdout };
}

function parseTestsJson(stdout) {
	const trimmed = stdout.trim();
	if (!trimmed) return { passed: 0, failed: 0, total: 0 };
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start < 0 || end < 0) return { passed: 0, failed: 0, total: 0 };
	let parsed;
	try {
		parsed = JSON.parse(trimmed.slice(start, end + 1));
	} catch {
		return { passed: 0, failed: 0, total: 0 };
	}
	return {
		passed: Number(parsed.numPassedTests ?? 0),
		failed: Number(parsed.numFailedTests ?? 0),
		total: Number(parsed.numTotalTests ?? 0),
	};
}

function readCoverageSummary() {
	if (!existsSync(COVERAGE_SUMMARY)) return { s: null, b: null, f: null, l: null };
	const raw = JSON.parse(readFileSync(COVERAGE_SUMMARY, "utf8"));
	const total = raw?.total ?? {};
	return {
		s: total.statements?.pct ?? null,
		b: total.branches?.pct ?? null,
		f: total.functions?.pct ?? null,
		l: total.lines?.pct ?? null,
	};
}

console.log("[collect-verify-data] god objects…");
const godObjects = GOD_OBJECTS.map(({ file, max }) => {
	const current = countLines(file);
	const diff = current - max;
	return { file, current, max, diff, pass: current <= max };
});

console.log("[collect-verify-data] pnpm lint…");
const lintRun = runPnpm(["lint"]);
const lint = { pass: lintRun.pass };

console.log("[collect-verify-data] pnpm format:check…");
const formatRun = runPnpm(["format:check"]);
const format = { pass: formatRun.pass };

console.log("[collect-verify-data] pnpm test --reporter=json…");
const testsRun = runPnpm(["test", "--reporter=json"]);
const tests = parseTestsJson(testsRun.stdout);

console.log("[collect-verify-data] pnpm test:coverage --reporter=json-summary…");
runPnpm(["test:coverage", "--reporter=json-summary"]);
const coverage = readCoverageSummary();

const payload = { godObjects, lint, format, tests, coverage };
writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`[collect-verify-data] wrote ${OUTPUT}`);
