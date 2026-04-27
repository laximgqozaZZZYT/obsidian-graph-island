#!/usr/bin/env node
// find-dead-exports.mjs — Generate a flat list of dead exports under src/
// using ts-prune, classified by syntactic kind, for consumption by the
// follow-on cleanup subtasks of 1427-dead-exports.
//
// Output: .autonomous/dead-exports-list.md (overwritten)
//
// Format (one entry per line, blank-line separated by file):
//   - `src/path/to/file.ts:LINE:COL` `exportName` [kind]
// where kind ∈ { type, const, function, class, enum, other }.
// A per-file count summary is appended at the end of the file.
//
// Lines marked `(used in module)` by ts-prune are filtered out — those are
// candidates for localization (handled by a different subtask), not dead
// exports for removal.
//
// Usage:
//   pnpm find-dead-exports

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const OUT_PATH = resolve(REPO_ROOT, ".autonomous/dead-exports-list.md");

// ts-prune line: `src/foo.ts:12 - SymbolName` or with a ` (used in module)` tail.
const TS_PRUNE_LINE = /^(.+?):(\d+) - (\S+)(?: \((used in module)\))?\s*$/;

function runTsPrune() {
	// spawnSync with explicit argv (no shell): inputs are constants, no injection vector.
	const res = spawnSync("npx", ["--yes", "ts-prune"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 16 * 1024 * 1024,
	});
	if (!res.stdout) {
		throw new Error(
			`ts-prune failed: ${res.stderr?.trim() || res.error?.message || "no output"}`,
		);
	}
	return res.stdout;
}

function parse(stdout) {
	const out = [];
	for (const raw of stdout.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(TS_PRUNE_LINE);
		if (!m) continue;
		const [, file, lineNo, symbol, marker] = m;
		if (!file.startsWith("src/")) continue;
		if (marker === "used in module") continue;
		out.push({ file, line: Number(lineNo), symbol });
	}
	return out;
}

const fileCache = new Map();
function readSourceLine(relFile, lineNo) {
	let lines = fileCache.get(relFile);
	if (!lines) {
		const abs = resolve(REPO_ROOT, relFile);
		if (!existsSync(abs)) return "";
		lines = readFileSync(abs, "utf8").split("\n");
		fileCache.set(relFile, lines);
	}
	return lines[lineNo - 1] ?? "";
}

// Classify by inspecting the source line for the `export` keyword pattern.
// `default` exports are classified by their value form when inferable.
function classify(sourceLine, symbol) {
	const trimmed = (sourceLine ?? "").trimStart();
	if (/^export\s+(?:declare\s+)?(?:type|interface)\b/.test(trimmed))
		return "type";
	if (/^export\s+(?:declare\s+)?(?:const|let|var)\b/.test(trimmed))
		return "const";
	if (/^export\s+(?:declare\s+|async\s+)?function\b/.test(trimmed))
		return "function";
	if (/^export\s+(?:declare\s+|abstract\s+)?class\b/.test(trimmed))
		return "class";
	if (/^export\s+(?:declare\s+|const\s+)?enum\b/.test(trimmed)) return "enum";
	if (/^export\s+default\s+function\b/.test(trimmed)) return "function";
	if (/^export\s+default\s+(?:abstract\s+)?class\b/.test(trimmed))
		return "class";
	if (/^export\s+default\b/.test(trimmed)) {
		// `export default <expr>` — infer from the symbol name when possible.
		// Capitalized → likely a class/type alias; otherwise treat as const value.
		return /^[A-Z]/.test(symbol) ? "class" : "const";
	}
	// Re-exports / aggregator forms: `export { ... } from "..."` / `export * from "..."`.
	// Resolving the original kind requires following the import — overkill for this report.
	return "other";
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findColumn(sourceLine, symbol) {
	if (!sourceLine) return 1;
	const re = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
	const m = re.exec(sourceLine);
	return m ? m.index + 1 : 1;
}

function annotate(entry) {
	const src = readSourceLine(entry.file, entry.line);
	const kind = classify(src, entry.symbol);
	const col = findColumn(src, entry.symbol);
	return { ...entry, col, kind };
}

function groupByFile(entries) {
	const byFile = new Map();
	for (const e of entries) {
		if (!byFile.has(e.file)) byFile.set(e.file, []);
		byFile.get(e.file).push(e);
	}
	for (const list of byFile.values()) {
		list.sort((a, b) => a.line - b.line || a.col - b.col);
	}
	return byFile;
}

function render(entries) {
	const now = new Date().toISOString();
	const byFile = groupByFile(entries);
	const files = [...byFile.keys()].sort();

	const out = [];
	out.push("# Dead Exports List");
	out.push("");
	out.push(`Generated: ${now}`);
	out.push(
		"Source: `npx ts-prune` under `src/`, excluding `(used in module)` entries.",
	);
	out.push(
		`Total entries: **${entries.length}** across ${files.length} files.`,
	);
	out.push("");
	out.push(
		"Format: `` `<path>:<line>:<col>` `<exportName>` [<kind>] ``  (kind ∈ type/const/function/class/enum/other)",
	);
	out.push("");

	for (const file of files) {
		out.push(`## \`${file}\``);
		out.push("");
		for (const e of byFile.get(file)) {
			out.push(
				`- \`${e.file}:${e.line}:${e.col}\` \`${e.symbol}\` [${e.kind}]`,
			);
		}
		out.push("");
	}

	out.push("## Per-file summary");
	out.push("");
	out.push("| File | Count |");
	out.push("|------|------:|");
	const counts = files.map((f) => [f, byFile.get(f).length]);
	counts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	for (const [file, n] of counts) {
		out.push(`| \`${file}\` | ${n} |`);
	}
	out.push("");

	const kindTotals = entries.reduce((acc, e) => {
		acc[e.kind] = (acc[e.kind] ?? 0) + 1;
		return acc;
	}, {});
	out.push("## Kind totals");
	out.push("");
	out.push("| Kind | Count |");
	out.push("|------|------:|");
	for (const k of ["type", "const", "function", "class", "enum", "other"]) {
		out.push(`| ${k} | ${kindTotals[k] ?? 0} |`);
	}
	out.push("");

	return out.join("\n");
}

function main() {
	const stdout = runTsPrune();
	const raw = parse(stdout);
	const entries = raw.map(annotate);

	mkdirSync(dirname(OUT_PATH), { recursive: true });
	writeFileSync(OUT_PATH, render(entries), "utf8");

	const rel = OUT_PATH.startsWith(REPO_ROOT + "/")
		? OUT_PATH.slice(REPO_ROOT.length + 1)
		: OUT_PATH;
	process.stdout.write(`Wrote ${rel} (entries=${entries.length})\n`);
}

main();
