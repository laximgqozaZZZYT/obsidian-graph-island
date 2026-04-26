import { describe, it, expect } from "vitest";
import { addFrontmatterTag, setFrontmatterField } from "../src/utils/frontmatter-helper";

describe("addFrontmatterTag", () => {
	it("appends tag to existing inline tags array", () => {
		const input = "---\ntitle: Test\ntags: [foo, bar]\n---\nBody";
		const result = addFrontmatterTag(input, "baz");
		expect(result).toBe("---\ntitle: Test\ntags: [foo, bar, baz]\n---\nBody");
	});

	it("handles empty inline tags array", () => {
		const input = "---\ntags: []\n---\nBody";
		const result = addFrontmatterTag(input, "first");
		expect(result).toBe("---\ntags: [first]\n---\nBody");
	});

	it("appends tag to list-style tags field", () => {
		const input = "---\ntitle: Test\ntags:\n---\nBody";
		const result = addFrontmatterTag(input, "newTag");
		expect(result).toBe("---\ntitle: Test\ntags:\n  - newTag\n---\nBody");
	});

	it("adds tags field when frontmatter exists but has no tags", () => {
		const input = "---\ntitle: Test\n---\nBody";
		const result = addFrontmatterTag(input, "myTag");
		expect(result).toBe("---\ntitle: Test\ntags: [myTag]\n---\nBody");
	});

	it("creates frontmatter block when none exists", () => {
		const input = "Just some content";
		const result = addFrontmatterTag(input, "newTag");
		expect(result).toBe("---\ntags: [newTag]\n---\nJust some content");
	});
});

describe("setFrontmatterField", () => {
	it("replaces existing field value", () => {
		const input = "---\ntitle: Old\ndate: 2024\n---\nBody";
		const result = setFrontmatterField(input, "title", "New");
		expect(result).toBe("---\ntitle: New\ndate: 2024\n---\nBody");
	});

	it("appends field when not present in existing frontmatter", () => {
		const input = "---\ntitle: Test\n---\nBody";
		const result = setFrontmatterField(input, "category", "notes");
		expect(result).toBe("---\ntitle: Test\ncategory: notes\n---\nBody");
	});

	it("creates frontmatter block when none exists", () => {
		const input = "Just content";
		const result = setFrontmatterField(input, "title", "New");
		expect(result).toBe("---\ntitle: New\n---\nJust content");
	});
});
