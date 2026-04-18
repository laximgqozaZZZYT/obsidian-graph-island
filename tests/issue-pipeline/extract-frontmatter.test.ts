import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs has no type declarations; pure function returns string|null
import { extractFrontmatter } from "../../scripts/issue-pipeline/extract-frontmatter.mjs";

describe("extractFrontmatter", () => {
	it("① extracts normal frontmatter body between delimiters", () => {
		const input = "---\nstatus: done\npriority: high\n---\n## Body";
		expect(extractFrontmatter(input)).toBe("status: done\npriority: high");
	});

	it("② returns null when the first line is not ---", () => {
		expect(extractFrontmatter("no yaml here\nstatus: done\n---")).toBeNull();
		expect(extractFrontmatter("")).toBeNull();
	});

	it("③ returns null when the closing --- is missing within 30 lines", () => {
		const input = "---\nstatus: pending\nnote: unterminated";
		expect(extractFrontmatter(input)).toBeNull();
	});

	it("③b returns null when the closing --- is beyond the 30-line window", () => {
		// Opening "---" + 29 filler lines with no closing delimiter
		const lines = ["---", ...Array.from({ length: 29 }, (_, i) => `k${i}: v`)];
		expect(extractFrontmatter(lines.join("\n"))).toBeNull();
	});

	it("④ returns empty string for empty frontmatter (---\\n---)", () => {
		expect(extractFrontmatter("---\n---")).toBe("");
		expect(extractFrontmatter("---\n---\nbody")).toBe("");
	});

	it("⑤ extracts YAML that contains no --- delimiter lines inside the body", () => {
		const input = [
			"---",
			"tags:",
			"  - foo",
			"  - bar",
			"summary: spec text without triple dashes",
			"---",
			"# Title",
		].join("\n");
		expect(extractFrontmatter(input)).toBe(
			"tags:\n  - foo\n  - bar\nsummary: spec text without triple dashes",
		);
	});

	it("strips trailing blank lines before the closing delimiter", () => {
		const input = "---\nstatus: done\n\n\n---";
		expect(extractFrontmatter(input)).toBe("status: done");
	});
});
