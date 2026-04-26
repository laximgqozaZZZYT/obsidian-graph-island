#!/usr/bin/env node
// list-dead-exports.mjs — Enumerate dead exports under src/ via ts-prune
// and categorize them into A/B/C/D buckets. Writes a Markdown report to
// `tmp/dead-exports-report.md` for the next sub-task to consume.
//
// Categories:
//   A: used only by tests under `tests/` -> keep export
//   B: used only inside the same module    -> can be made local (ts-prune marker)
//   C: completely unused                   -> deletion candidate
//   D: type-only declarations in types.ts  -> needs API-compat consideration
//
// Usage:
//   node scripts/list-dead-exports.mjs
//
// Output: tmp/dead-exports-report.md (overwritten)

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const REPORT_DIR = resolve(REPO_ROOT, "tmp");
const REPORT = resolve(REPORT_DIR, "dead-exports-report.md");

function runTsPrune() {
	const res = spawnSync("npx", ["--yes", "ts-prune"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 16 * 1024 * 1024,
	});
	if (res.status !== 0 && !res.stdout) {
		throw new Error(`ts-prune failed: ${res.stderr || res.error?.message}`);
	}
	return res.stdout || "";
}

// ts-prune line format:
//   src/foo.ts:12 - SymbolName
//   src/foo.ts:12 - SymbolName (used in module)
const LINE_RE = /^(.+?):(\d+) - (\S+)(?: \((used in module)\))?\s*$/;

function parseTsPrune(stdout) {
	const entries = [];
	for (const raw of stdout.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(LINE_RE);
		if (!m) continue;
		const [, file, lineNo, symbol, marker] = m;
		if (!file.startsWith("src/")) continue;
		entries.push({
			file,
			line: Number(lineNo),
			symbol,
			usedInModule: marker === "used in module",
		});
	}
	return entries;
}

// Returns true when any tests/**/*.{ts,tsx,js,mjs} imports the given symbol
// from a path that resolves to the source file.
function isReferencedFromTests(entry) {
	const moduleBase = entry.file.replace(/^src\//, "").replace(/\.tsx?$/, "");
	// We grep for the bare symbol name first (cheap), then verify the import
	// path mentions the module slug. False positives are acceptable here —
	// they conservatively keep exports rather than incorrectly drop them.
	const grep = spawnSync(
		"grep",
		[
			"-rE",
			"--include=*.ts",
			"--include=*.tsx",
			"--include=*.js",
			"--include=*.mjs",
			`\\b${escapeRegex(entry.symbol)}\\b`,
			"tests",
		],
		{ cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	);
	if (grep.status !== 0) return false;
	const lines = grep.stdout.split("\n").filter(Boolean);
	const moduleSlug = moduleBase.split("/").pop();
	return lines.some(
		(l) =>
			l.includes("import") &&
			(l.includes(moduleBase) || l.includes(moduleSlug)),
	);
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categorize(entry) {
	if (entry.file === "src/types.ts") return "D";
	if (entry.usedInModule) return "B";
	if (isReferencedFromTests(entry)) return "A";
	return "C";
}

function bucketize(entries) {
	const buckets = { A: [], B: [], C: [], D: [] };
	for (const e of entries) {
		const cat = categorize(e);
		buckets[cat].push({ ...e, category: cat });
	}
	for (const k of Object.keys(buckets)) {
		buckets[k].sort(
			(x, y) =>
				x.file.localeCompare(y.file) || x.line - y.line || x.symbol.localeCompare(y.symbol),
		);
	}
	return buckets;
}

const CATEGORY_TITLES = {
	A: "Category A — used only by tests (keep export)",
	B: "Category B — used only inside same module (can be localized)",
	C: "Category C — completely unused (deletion candidate)",
	D: "Category D — type definitions in types.ts (API compat)",
};

function renderReport(buckets, total) {
	const now = new Date().toISOString();
	const lines = [];
	lines.push("# Dead Exports Report");
	lines.push("");
	lines.push(`Generated: ${now}`);
	lines.push(`Source: \`npx ts-prune\` (entries under \`src/\`)`);
	lines.push(`Total dead exports: **${total}**`);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push("| Category | Description | Count |");
	lines.push("|----------|-------------|------:|");
	for (const k of ["A", "B", "C", "D"]) {
		lines.push(`| ${k} | ${CATEGORY_TITLES[k].split(" — ")[1]} | ${buckets[k].length} |`);
	}
	lines.push("");
	for (const k of ["A", "B", "C", "D"]) {
		lines.push(`## ${CATEGORY_TITLES[k]}`);
		lines.push("");
		if (buckets[k].length === 0) {
			lines.push("_(none)_");
			lines.push("");
			continue;
		}
		lines.push("| File | Line | Symbol | Category |");
		lines.push("|------|-----:|--------|----------|");
		for (const e of buckets[k]) {
			lines.push(`| \`${e.file}\` | ${e.line} | \`${e.symbol}\` | ${k} |`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

function main() {
	const stdout = runTsPrune();
	const entries = parseTsPrune(stdout);
	const buckets = bucketize(entries);
	mkdirSync(REPORT_DIR, { recursive: true });
	const md = renderReport(buckets, entries.length);
	writeFileSync(REPORT, md, "utf8");
	const rel = relative(REPO_ROOT, REPORT);
	const counts = ["A", "B", "C", "D"]
		.map((k) => `${k}=${buckets[k].length}`)
		.join(" ");
	process.stdout.write(
		`Wrote ${rel} (total=${entries.length}, ${counts})\n`,
	);
}

main();
