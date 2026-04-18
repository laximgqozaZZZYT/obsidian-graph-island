#!/usr/bin/env node
// emit-git-status-short.mjs
//
// Subtask-2 of 771-760- (see scripts/pipeline/tasks/806-771-acceptance-criteria-stdout.md).
//
// Responsibility: call subtask-1's `formatGitStatusShortResult`, assert the
// three acceptance criteria from the parent task (no git ops were performed,
// target_mark resolved to "M"|"missing", unexpected changes were warned),
// then emit the result as a single JSON line on stdout.
//
// Non-zero exit is reserved for assert failures only — git operations live
// in the sibling commit task.

import { readFileSync } from "node:fs";
import { formatGitStatusShortResult } from "./format-git-status-short.mjs";

const VALID_TARGET_MARKS = ["M", "missing"];
// "波及" is the token classify-git-status.sh emits; English fallbacks let
// callers supply either dialect without breaking the assert.
const LEAK_WARNING_PATTERN = /波及|unexpected|leak/i;

export function assertNoGitOps(input) {
	if (input?.gitOpsPerformed === true) {
		throw new Error(
			"E_GIT_OPS_FORBIDDEN: git mv/add/commit must be deferred to the commit subtask",
		);
	}
}

export function assertTargetMark(targetMark) {
	if (!VALID_TARGET_MARKS.includes(targetMark)) {
		throw new Error(
			`E_TARGET_MARK_INVALID: ${JSON.stringify(targetMark)} (expected "M" | "missing")`,
		);
	}
}

export function assertUnexpectedChangesWarned(input, result) {
	const leaked = (input?.unexpected_changes?.length ?? 0) > 0;
	if (!leaked) return;
	const hasLeakWarning = (result?.warnings ?? []).some(
		(w) => typeof w === "string" && LEAK_WARNING_PATTERN.test(w),
	);
	if (!hasLeakWarning) {
		throw new Error(
			"E_UNEXPECTED_CHANGES_NOT_WARNED: unexpected_changes present but warnings missing leak message",
		);
	}
}

export function emitGitStatusShort(input) {
	assertNoGitOps(input);
	const result = formatGitStatusShortResult(input);
	assertTargetMark(result.target_mark);
	assertUnexpectedChangesWarned(input, result);
	return result;
}

function main() {
	let raw = "";
	try {
		raw = readFileSync(0, "utf8");
	} catch {
		raw = "";
	}
	if (!raw.trim()) {
		process.stderr.write("E_NO_INPUT: expected JSON on stdin\n");
		process.exit(1);
	}
	let input;
	try {
		input = JSON.parse(raw);
	} catch (e) {
		process.stderr.write(`E_BAD_JSON: ${e?.message ?? e}\n`);
		process.exit(1);
	}
	try {
		const result = emitGitStatusShort(input);
		// Single-line JSON keeps the stdout contract identical to the
		// classify/format steps upstream, so a downstream `jq` works.
		console.log(JSON.stringify(result));
	} catch (e) {
		process.stderr.write(`${e?.message ?? e}\n`);
		process.exit(1);
	}
}

// Run as CLI only when invoked directly (not when imported by the test layer).
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	import.meta.url === `file://${process.argv[1]}`
) {
	main();
}
