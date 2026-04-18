#!/usr/bin/env node
// verify-frontmatter-baseline.mjs
//
// Subtask-2 of 759-730-edit-read-frontmatter (see
// scripts/pipeline/tasks/782-759-read-frontmatter-subtask-1-baseline.md).
//
// Contract:
//   Args   : <target.md> [baseline.json]
//            baseline.json defaults to
//            .claude/tasks/730-717-status-done-edit/baseline.json
//            (the path subtask-1 / 781-759-subtask writes to).
//   Keys   : status (expected "done"), priority, reported, parent, depends,
//            summary, source
//   Match  : exact string — case-sensitive, whitespace-sensitive
//   Stdout : "FRONTMATTER OK" on PASS, otherwise "ERROR" + one line per diff
//            in the form "  key=<k> expected=<q> actual=<q>"
//   Exit   : 0 on PASS, 1 on mismatch / IO error / malformed frontmatter
//
// Scope: helper script only. Lives outside src/ so the god-object budget
// stays untouched.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMPARE_KEYS = [
	"status",
	"priority",
	"reported",
	"parent",
	"depends",
	"summary",
	"source",
];
const DEFAULT_BASELINE = ".claude/tasks/730-717-status-done-edit/baseline.json";

function fail(msg) {
	console.log(msg);
	process.exit(1);
}

// Parse frontmatter exactly the way subtask-1 was expected to — the value
// after "key:" keeps its original spacing (apart from the single separating
// space, which is the YAML convention subtask-1 serializes with).
function parseFrontmatter(text, label) {
	const match = text.match(/^---\n([\s\S]*?)\n---/);
	if (!match) {
		fail(`ERROR: ${label} has no '---' frontmatter block`);
	}
	const body = match[1];
	const fm = {};
	for (const line of body.split("\n")) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?: (.*))?$/);
		if (!m) continue;
		fm[m[1]] = m[2] ?? "";
	}
	return fm;
}

function readJson(path, label) {
	let raw;
	try {
		raw = readFileSync(path, "utf8");
	} catch (e) {
		fail(`ERROR: cannot read ${label} ${path}: ${e.message}`);
	}
	try {
		return JSON.parse(raw);
	} catch (e) {
		fail(`ERROR: ${label} ${path} is not valid JSON: ${e.message}`);
	}
}

function readText(path, label) {
	try {
		return readFileSync(path, "utf8");
	} catch (e) {
		fail(`ERROR: cannot read ${label} ${path}: ${e.message}`);
	}
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.length < 1 || argv[0] === "-h" || argv[0] === "--help") {
		console.error(
			"Usage: verify-frontmatter-baseline.mjs <target.md> [baseline.json]",
		);
		process.exit(1);
	}
	const targetPath = resolve(argv[0]);
	const baselinePath = resolve(argv[1] ?? DEFAULT_BASELINE);

	const baseline = readJson(baselinePath, "baseline");
	const expected = baseline?.frontmatter;
	if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
		fail(`ERROR: baseline ${baselinePath} has no 'frontmatter' object`);
	}

	const text = readText(targetPath, "target");
	const actual = parseFrontmatter(text, "target");

	const diffs = [];
	for (const key of COMPARE_KEYS) {
		if (!(key in expected)) continue; // baseline omitted → nothing to compare
		const exp = String(expected[key]);
		const act = key in actual ? String(actual[key]) : "";
		if (exp !== act) diffs.push({ key, expected: exp, actual: act });
	}

	if (diffs.length > 0) {
		console.log("ERROR: frontmatter mismatch vs baseline");
		for (const d of diffs) {
			console.log(
				`  key=${d.key} expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`,
			);
		}
		process.exit(1);
	}

	console.log("FRONTMATTER OK");
	process.exit(0);
}

main();
