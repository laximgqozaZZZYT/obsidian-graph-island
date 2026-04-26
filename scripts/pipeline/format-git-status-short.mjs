#!/usr/bin/env node
// format-git-status-short.mjs
//
// Subtask 804-771-subtask-2-stdout of parent 771-760-.
// Reads the classification result produced by
// `scripts/pipeline/classify-git-status.sh` (key=value lines, see that
// script's header for the stable contract) and emits a structured JSON
// result on stdout that downstream pipeline steps can consume without
// re-parsing. Also writes a trailing "DONE" marker so the shell driver
// can detect completion.
//
// Scope: read-only integration glue. Intentionally performs NO git
// operations (no `git mv`, `git add`, or `git commit`) — the commit
// sibling task owns side effects. Lives outside src/ so the god-object
// budget (see CLAUDE.md) stays untouched.
//
// Contract:
//   stdin / <input-file> : classify-git-status.sh stdout (key=value)
//   stdout               : one JSON line + "DONE"
//   exit                 : 0 on successful emit (ok OR warning);
//                          non-zero only on IO / parse failure
//
// Usage:
//   bash scripts/pipeline/classify-git-status.sh <target> \
//     | node scripts/pipeline/format-git-status-short.mjs
//   node scripts/pipeline/format-git-status-short.mjs <classify-output-file>

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function parseClassifyOutput(text) {
	const out = { target: "", expected_found: "0", unexpected_files: "", warnings: [] };
	for (const line of text.split(/\r?\n/)) {
		if (!line) continue;
		const eq = line.indexOf("=");
		// eq <= 0 rejects both "no =" (-1) and empty keys ("=value", 0).
		if (eq <= 0) continue;
		const key = line.slice(0, eq);
		const value = line.slice(eq + 1);
		if (key === "warning") out.warnings.push(value);
		else if (key in out) out[key] = value;
	}
	return out;
}

function formatGitStatusShortResult(input) {
	const target_file = String(input.target ?? "");
	const target_mark = String(input.expected_found) === "1" ? "M" : "missing";
	const unexpected_changes = String(input.unexpected_files ?? "").split(",").filter(Boolean);
	const warnings = Array.isArray(input.warnings) ? input.warnings.slice() : [];
	// "ok" means: target cleanly modified, no scope leak, AND no upstream warning.
	// The last clause future-proofs against awk emitting warnings beyond the current two cases.
	const status =
		target_mark === "M" && unexpected_changes.length === 0 && warnings.length === 0
			? "ok"
			: "warning";
	return { status, target_file, target_mark, unexpected_changes, warnings };
}

function main(argv) {
	const src = argv[2];
	const text =
		!src || src === "-" ? readFileSync(0, "utf8") : readFileSync(src, "utf8");
	const input = parseClassifyOutput(text);
	const result = formatGitStatusShortResult(input);
	process.stdout.write(JSON.stringify(result) + "\n");
	process.stdout.write("DONE\n");
}

// pathToFileURL handles spaces / non-ASCII paths; raw `file://` interpolation does not.
const invoked =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) main(process.argv);

export { parseClassifyOutput, formatGitStatusShortResult };
