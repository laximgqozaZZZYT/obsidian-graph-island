import { describe, it, expect } from "vitest";
import { formatGitStatusShortResult } from "../../src/utils/git-status-formatter";

describe("formatGitStatusShortResult", () => {
	it("returns status=ok when target_mark is M and unexpected_changes empty", () => {
		const result = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: [],
			warnings: [],
		});
		expect(result.status).toBe("ok");
		expect(result.target_file).toBe("foo.ts");
		expect(result.target_mark).toBe("M");
		expect(result.unexpected_changes).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("returns status=warning when target_mark is missing", () => {
		const result = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "missing",
			unexpected_changes: [],
			warnings: [],
		});
		expect(result.status).toBe("warning");
	});

	it("returns status=warning when unexpected_changes is non-empty", () => {
		const result = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: ["bar.ts"],
			warnings: [],
		});
		expect(result.status).toBe("warning");
		expect(result.unexpected_changes).toEqual(["bar.ts"]);
	});

	it("falls back warnings null/undefined to empty array", () => {
		const r1 = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: [],
			warnings: null,
		});
		const r2 = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
		});
		expect(r1.warnings).toEqual([]);
		expect(r2.warnings).toEqual([]);
		expect(r2.unexpected_changes).toEqual([]);
	});

	it("preserves warnings input as-is", () => {
		const warnings = ["w1", "w2"];
		const result = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: [],
			warnings,
		});
		expect(result.warnings).toEqual(["w1", "w2"]);
	});

	it("returns warning when both target_mark=missing and unexpected_changes non-empty", () => {
		const result = formatGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "missing",
			unexpected_changes: ["bar.ts", "baz.ts"],
			warnings: ["target file missing", "side effects detected"],
		});
		expect(result.status).toBe("warning");
		expect(result.unexpected_changes).toEqual(["bar.ts", "baz.ts"]);
		expect(result.warnings).toEqual(["target file missing", "side effects detected"]);
	});
});
