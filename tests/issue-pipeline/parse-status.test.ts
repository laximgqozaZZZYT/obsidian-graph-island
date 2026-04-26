import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs has no type declarations; pure function returns string|null
import { parseStatus } from "../../scripts/issue-pipeline/parse-status.mjs";

describe("parseStatus", () => {
	it("extracts the status value from a typical frontmatter body", () => {
		const body = "priority: high\nstatus: pending\nsource: decomposed";
		expect(parseStatus(body)).toBe("pending");
	});

	it("returns null for non-string or empty input", () => {
		expect(parseStatus("")).toBeNull();
		// @ts-expect-error -- runtime guard check
		expect(parseStatus(null)).toBeNull();
		// @ts-expect-error -- runtime guard check
		expect(parseStatus(undefined)).toBeNull();
	});

	it("returns null when no status line exists", () => {
		expect(parseStatus("priority: high\nsource: decomposed")).toBeNull();
	});

	it("returns only the first status line when duplicates exist", () => {
		const body = "status: pending\npriority: high\nstatus: done";
		expect(parseStatus(body)).toBe("pending");
	});

	it("ignores lines with leading whitespace (non top-level)", () => {
		const body = "meta:\n  status: pending\nstatus: done";
		expect(parseStatus(body)).toBe("done");
	});

	it("tolerates CRLF line endings", () => {
		expect(parseStatus("priority: high\r\nstatus: in-progress\r\n")).toBe("in-progress");
	});

	it("strips surrounding double quotes", () => {
		expect(parseStatus('status: "done"')).toBe("done");
	});

	it("strips surrounding single quotes", () => {
		expect(parseStatus("status: 'pending'")).toBe("pending");
	});

	it("does not strip mismatched quotes", () => {
		expect(parseStatus("status: \"done'")).toBe("\"done'");
	});

	it("strips trailing # comment", () => {
		expect(parseStatus("status: done  # finished")).toBe("done");
	});

	it("returns empty string for empty value (no quoting)", () => {
		expect(parseStatus("status:")).toBe("");
		expect(parseStatus("status:   ")).toBe("");
	});

	it("accepts status values with internal hyphens and whitespace trimming", () => {
		expect(parseStatus("status:    in-progress   ")).toBe("in-progress");
	});
});
