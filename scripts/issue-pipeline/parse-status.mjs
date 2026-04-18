// Pure function: parse the YAML `status:` value from an extracted frontmatter body.
// Spec: scripts/pipeline/tasks/753-729-subtask.md
//       (gate processing for "status already done -> no-op termination")
//
// Input:
//   body - frontmatter body string (typically the output of extract-frontmatter.mjs,
//          i.e. the lines between the opening and closing `---` delimiters).
//
// Returns:
//   - the trimmed status string (e.g. "done", "pending", "in-progress")
//   - null when no `status:` line is found, or when the input is not a non-empty string
//
// Rules:
//   - Only top-level `status:` lines are recognized (no leading whitespace).
//   - Only the first matching line is returned.
//   - Surrounding single or double quotes are stripped when they match on both ends.
//   - A trailing `# comment` is stripped.
//   - CRLF line endings are tolerated (same as extract-frontmatter.mjs).

const STATUS_LINE = /^status\s*:\s*(.*)$/;

export function parseStatus(body) {
	if (typeof body !== "string" || body.length === 0) return null;

	const lines = body.split(/\r?\n/);
	for (const line of lines) {
		const match = line.match(STATUS_LINE);
		if (!match) continue;

		let value = match[1];
		const hashIdx = value.indexOf("#");
		if (hashIdx !== -1) value = value.slice(0, hashIdx);
		value = value.trim();

		if (value.length >= 2) {
			const first = value[0];
			const last = value[value.length - 1];
			if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
				value = value.slice(1, -1);
			}
		}
		return value;
	}
	return null;
}

export default parseStatus;
