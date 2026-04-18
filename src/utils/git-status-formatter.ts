export type GitStatusShortResultStatus = "ok" | "warning";
export type GitStatusShortTargetMark = "M" | "missing";

export interface GitStatusShortInput {
	target_file: string;
	target_mark: GitStatusShortTargetMark;
	unexpected_changes?: string[] | null;
	warnings?: string[] | null;
}

export interface GitStatusShortResult {
	status: GitStatusShortResultStatus;
	target_file: string;
	target_mark: GitStatusShortTargetMark;
	unexpected_changes: string[];
	warnings: string[];
}

export function formatGitStatusShortResult(input: GitStatusShortInput): GitStatusShortResult {
	const unexpected = Array.isArray(input.unexpected_changes) ? input.unexpected_changes : [];
	const warnings = Array.isArray(input.warnings) ? input.warnings : [];
	const status: GitStatusShortResultStatus =
		input.target_mark === "missing" || unexpected.length > 0 ? "warning" : "ok";
	return {
		status,
		target_file: input.target_file,
		target_mark: input.target_mark,
		unexpected_changes: unexpected,
		warnings,
	};
}
