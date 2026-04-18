#!/usr/bin/env node
// read-frontmatter.mjs — Read an issue file's first 30 lines as a frontmatter window.
//
// Subtask of 766-733-issue-read-frontmatter: wraps a Read(offset=0, limit=30)
// equivalent on an absolute issue path produced by 701-691-glob-read.
//
// Usage:
//   node scripts/issue-pipeline/read-frontmatter.mjs <issueAbsPath>
//
// Behavior:
//   - Missing file       -> stderr "E_NOT_FOUND:<path>", process.exit(2)
//   - Missing argument   -> stderr "E_NO_ARG", process.exit(2)
//   - Success            -> stdout JSON {path, head30}, exit 0

import { readFileSync } from "node:fs";

const HEAD_LIMIT = 30;

function main(argv) {
	const issueAbsPath = argv[2];
	if (!issueAbsPath) {
		process.stderr.write("E_NO_ARG");
		process.exit(2);
	}
	// Single read with ENOENT handling avoids a TOCTOU gap between existsSync and readFileSync.
	let raw;
	try {
		raw = readFileSync(issueAbsPath, "utf8");
	} catch (err) {
		if (err?.code === "ENOENT") {
			process.stderr.write(`E_NOT_FOUND:${issueAbsPath}`);
			process.exit(2);
		}
		throw err;
	}
	// Accept CRLF (/\r?\n/) to stay aligned with 800-766-raw-head-frontmatter-text.md.
	const head30 = raw.split(/\r?\n/).slice(0, HEAD_LIMIT).join("\n");
	process.stdout.write(JSON.stringify({ path: issueAbsPath, head30 }));
}

main(process.argv);
