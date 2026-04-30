#!/usr/bin/env node
// find-dead-exports.mjs — Enumerate dead exports under src/ and report
// each entry as (file, symbol, kind). Symbols that are referenced from
// `tests/` are excluded. Symbols marked `// @public` in source are kept.
//
// Output (default): plain-text rows
//   <file>:<line>  <kind>  <symbol>
// followed by a one-line summary on stderr.
//
// Usage:
//   node scripts/find-dead-exports.mjs [--json] [--all]
//     --json  emit JSON array instead of plain rows
//     --all   include entries marked `(used in module)` (default: include)
//
// Source: `npx ts-prune` over the project's tsconfig. Kind detection reads
// the source line and classifies the export as one of:
//   function | const | let | var | class | interface | type | enum | unknown

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

const args = new Set(process.argv.slice(2));
const EMIT_JSON = args.has("--json");

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

const fileCache = new Map();
function readSourceLines(file) {
	if (fileCache.has(file)) return fileCache.get(file);
	const abs = resolve(REPO_ROOT, file);
	if (!existsSync(abs)) {
		fileCache.set(file, []);
		return [];
	}
	const lines = readFileSync(abs, "utf8").split("\n");
	fileCache.set(file, lines);
	return lines;
}

// Classify the kind of an exported symbol by inspecting its source line(s).
function detectKind(file, lineNo, symbol) {
	const lines = readSourceLines(file);
	if (lines.length === 0) return "unknown";
	// ts-prune line numbers are 1-based; widen the search window slightly
	// because re-export lines may bind aliases.
	const startIdx = Math.max(0, lineNo - 1);
	const endIdx = Math.min(lines.length, lineNo + 2);
	const window = lines.slice(startIdx, endIdx).join("\n");
	const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const patterns = [
		[new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${esc}\\b`), "function"],
		[new RegExp(`\\b(?:export\\s+)?(?:abstract\\s+)?class\\s+${esc}\\b`), "class"],
		[new RegExp(`\\b(?:export\\s+)?interface\\s+${esc}\\b`), "interface"],
		[new RegExp(`\\b(?:export\\s+)?type\\s+${esc}\\b`), "type"],
		[new RegExp(`\\b(?:export\\s+)?enum\\s+${esc}\\b`), "enum"],
		[new RegExp(`\\b(?:export\\s+)?const\\s+${esc}\\b`), "const"],
		[new RegExp(`\\b(?:export\\s+)?let\\s+${esc}\\b`), "let"],
		[new RegExp(`\\b(?:export\\s+)?var\\s+${esc}\\b`), "var"],
	];
	for (const [re, kind] of patterns) {
		if (re.test(window)) return kind;
	}
	// Fallbacks for re-exports: `export { Foo }` or `export { Foo as Bar }`
	if (new RegExp(`export\\s*\\{[^}]*\\b${esc}\\b[^}]*\\}`).test(window)) {
		return "re-export";
	}
	return "unknown";
}

// Returns true when the symbol's declaration line carries a "// @public" marker.
function isMarkedPublic(file, lineNo) {
	const lines = readSourceLines(file);
	if (lines.length === 0) return false;
	const at = lineNo - 1;
	const here = lines[at] ?? "";
	const above = lines[at - 1] ?? "";
	return /\/\/\s*@public\b/.test(here) || /\/\/\s*@public\b/.test(above);
}

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const testRefCache = new Map();
function isReferencedFromTests(symbol) {
	if (testRefCache.has(symbol)) return testRefCache.get(symbol);
	// Treat any occurrence of the symbol inside `tests/` as a reference. This
	// over-approximates (false positives keep an export instead of dropping
	// it), which is the safer direction for a deletion-candidate report.
	const grep = spawnSync(
		"grep",
		[
			"-rlE",
			"--include=*.ts",
			"--include=*.tsx",
			"--include=*.js",
			"--include=*.mjs",
			`\\b${escapeRegex(symbol)}\\b`,
			"tests",
		],
		{ cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	);
	const referenced = grep.status === 0 && (grep.stdout || "").trim().length > 0;
	testRefCache.set(symbol, referenced);
	return referenced;
}

function main() {
	let stdout;
	try {
		stdout = runTsPrune();
	} catch (err) {
		console.error(err.message);
		process.exit(2);
	}
	const entries = parseTsPrune(stdout);
	const rows = [];
	for (const e of entries) {
		if (isMarkedPublic(e.file, e.line)) continue;
		if (isReferencedFromTests(e.symbol)) continue;
		const kind = detectKind(e.file, e.line, e.symbol);
		rows.push({ ...e, kind });
	}
	rows.sort(
		(a, b) =>
			a.file.localeCompare(b.file) ||
			a.line - b.line ||
			a.symbol.localeCompare(b.symbol),
	);
	if (EMIT_JSON) {
		process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
	} else {
		for (const r of rows) {
			const kindCol = `${r.kind}${r.usedInModule ? " (in-module)" : ""}`;
			process.stdout.write(`${r.file}:${r.line}  ${kindCol}  ${r.symbol}\n`);
		}
	}
	const byKind = rows.reduce((acc, r) => {
		acc[r.kind] = (acc[r.kind] || 0) + 1;
		return acc;
	}, {});
	const summary = Object.entries(byKind)
		.sort()
		.map(([k, v]) => `${k}=${v}`)
		.join(" ");
	process.stderr.write(`\n[find-dead-exports] total=${rows.length} ${summary}\n`);
}

main();
