/**
 * frontmatter-helper.ts
 *
 * Pure string→string helpers for YAML frontmatter manipulation.
 * Extracted from GraphViewContainer to reduce god-object size.
 */

/**
 * Add a tag to the frontmatter tags array.
 * Handles inline `tags: [...]`, list `tags:\n  - ...`, and missing tags field.
 * Creates a YAML frontmatter block if one doesn't exist.
 */
export function addFrontmatterTag(content: string, tag: string): string {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const fmBody = fmMatch[1];
		const tagsRegex = /^tags:\s*\[([^\]]*)\]/m;
		const tagsListRegex = /^tags:\s*$/m;
		if (tagsRegex.test(fmBody)) {
			const newFm = fmBody.replace(tagsRegex, (match, inner) => {
				const existing = inner ? inner + ", " : "";
				return `tags: [${existing}${tag}]`;
			});
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else if (tagsListRegex.test(fmBody)) {
			const newFm = fmBody.replace(tagsListRegex, `tags:\n  - ${tag}`);
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else {
			const newFm = fmBody + `\ntags: [${tag}]`;
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		}
	} else {
		return `---\ntags: [${tag}]\n---\n${content}`;
	}
}

/**
 * Set a frontmatter field to a value.
 * Replaces the field if it already exists, appends it otherwise.
 * Creates a YAML frontmatter block if one doesn't exist.
 */
export function setFrontmatterField(content: string, key: string, value: string): string {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const fmBody = fmMatch[1];
		const regex = new RegExp(`^${key}:.*$`, "m");
		if (regex.test(fmBody)) {
			const newFm = fmBody.replace(regex, `${key}: ${value}`);
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		} else {
			const newFm = fmBody + `\n${key}: ${value}`;
			return content.replace(fmMatch[0], `---\n${newFm}\n---`);
		}
	} else {
		return `---\n${key}: ${value}\n---\n${content}`;
	}
}
