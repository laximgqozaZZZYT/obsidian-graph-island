// Pure function: extract YAML frontmatter body from the first 30 lines.
// Spec: scripts/pipeline/tasks/800-766-head30-frontmatter.md
//
// Returns:
//   - null  when the 1st line is not "---"
//   - null  when the closing "---" is not found within the first 30 lines
//   - ""    when the frontmatter is empty ("---\n---")
//   - the joined body lines (without delimiters, trailing newlines stripped)
//
// Multiple "---" lines: only the first closing "---" is recognized (spec note).

const MAX_LINES = 30;
const DELIM = "---";

export function extractFrontmatter(head30) {
	if (typeof head30 !== "string" || head30.length === 0) return null;

	const lines = head30.split(/\r?\n/);
	if (lines[0] !== DELIM) return null;

	const limit = Math.min(lines.length, MAX_LINES);
	for (let i = 1; i < limit; i++) {
		if (lines[i] === DELIM) {
			const body = lines.slice(1, i).join("\n");
			return body.replace(/\n+$/, "");
		}
	}
	return null;
}

export default extractFrontmatter;
