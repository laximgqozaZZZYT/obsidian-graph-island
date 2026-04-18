import {
	formatGitStatusShortResult,
	GitStatusShortInput,
	GitStatusShortResult,
	GitStatusShortTargetMark,
} from "./git-status-formatter";

export interface GitStatusShortEmitInput extends GitStatusShortInput {
	gitOpsPerformed?: boolean;
}

const VALID_TARGET_MARKS: readonly GitStatusShortTargetMark[] = ["M", "missing"];

export function assertGitStatusShortInput(input: GitStatusShortEmitInput): void {
	if (input.gitOpsPerformed === true) {
		throw new Error("git mv/add/commit must not be performed by this task");
	}
	if (!VALID_TARGET_MARKS.includes(input.target_mark)) {
		throw new Error(`target_mark must be "M" or "missing", got: ${String(input.target_mark)}`);
	}
}

export function buildGitStatusShortResult(input: GitStatusShortEmitInput): GitStatusShortResult {
	assertGitStatusShortInput(input);
	const formatted = formatGitStatusShortResult(input);
	const { unexpected_changes: unexpected, warnings } = formatted;
	if (unexpected.length > 0) {
		const msg = `unexpected changes detected: ${unexpected.join(", ")}`;
		if (!warnings.includes(msg)) warnings.push(msg);
	}
	return formatted;
}

export function emitGitStatusShortResult(input: GitStatusShortEmitInput): GitStatusShortResult {
	const result = buildGitStatusShortResult(input);
	// eslint-disable-next-line no-console
	console.log(JSON.stringify(result));
	return result;
}
