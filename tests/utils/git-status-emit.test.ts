import { describe, it, expect, vi, afterEach } from "vitest";
import {
	assertGitStatusShortInput,
	buildGitStatusShortResult,
	emitGitStatusShortResult,
} from "../../src/utils/git-status-emit";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("assertGitStatusShortInput", () => {
	it("throws when gitOpsPerformed is true", () => {
		expect(() =>
			assertGitStatusShortInput({
				target_file: "foo.ts",
				target_mark: "M",
				gitOpsPerformed: true,
			}),
		).toThrow(/git mv\/add\/commit/);
	});

	it("does not throw when gitOpsPerformed is false", () => {
		expect(() =>
			assertGitStatusShortInput({
				target_file: "foo.ts",
				target_mark: "M",
				gitOpsPerformed: false,
			}),
		).not.toThrow();
	});

	it("does not throw when gitOpsPerformed is omitted", () => {
		expect(() =>
			assertGitStatusShortInput({
				target_file: "foo.ts",
				target_mark: "missing",
			}),
		).not.toThrow();
	});

	it("throws when target_mark is unexpected", () => {
		expect(() =>
			assertGitStatusShortInput({
				target_file: "foo.ts",
				// @ts-expect-error — deliberately invalid value for test
				target_mark: "A",
			}),
		).toThrow(/target_mark/);
	});
});

describe("buildGitStatusShortResult", () => {
	it("returns formatted result for valid M input", () => {
		const result = buildGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: [],
		});
		expect(result.status).toBe("ok");
		expect(result.warnings).toEqual([]);
	});

	it("appends propagation warning when unexpected_changes is non-empty", () => {
		const result = buildGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: ["bar.ts", "baz.ts"],
		});
		expect(result.status).toBe("warning");
		expect(result.warnings.some((w) => w.includes("bar.ts") && w.includes("baz.ts"))).toBe(true);
	});

	it("preserves pre-existing warnings when appending propagation message", () => {
		const result = buildGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: ["bar.ts"],
			warnings: ["existing"],
		});
		expect(result.warnings[0]).toBe("existing");
		expect(result.warnings.length).toBeGreaterThanOrEqual(2);
	});

	it("does not duplicate propagation message if already present", () => {
		const msg = "unexpected changes detected: bar.ts";
		const result = buildGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: ["bar.ts"],
			warnings: [msg],
		});
		expect(result.warnings.filter((w) => w === msg).length).toBe(1);
	});

	it("throws when gitOpsPerformed is true", () => {
		expect(() =>
			buildGitStatusShortResult({
				target_file: "foo.ts",
				target_mark: "M",
				gitOpsPerformed: true,
			}),
		).toThrow();
	});
});

describe("emitGitStatusShortResult", () => {
	it("writes valid JSON to stdout", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = emitGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "M",
			unexpected_changes: [],
		});
		expect(spy).toHaveBeenCalledTimes(1);
		const printed = spy.mock.calls[0][0];
		expect(typeof printed).toBe("string");
		const parsed = JSON.parse(printed as string);
		expect(parsed).toEqual(result);
		expect(parsed.status).toBe("ok");
		expect(parsed.target_file).toBe("foo.ts");
	});

	it("does not log when assertion fails (gitOpsPerformed=true)", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		expect(() =>
			emitGitStatusShortResult({
				target_file: "foo.ts",
				target_mark: "M",
				gitOpsPerformed: true,
			}),
		).toThrow();
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not log when target_mark is invalid", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		expect(() =>
			emitGitStatusShortResult({
				target_file: "foo.ts",
				// @ts-expect-error — deliberately invalid
				target_mark: "X",
			}),
		).toThrow();
		expect(spy).not.toHaveBeenCalled();
	});

	it("emits warning status with propagated unexpected_changes message", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		emitGitStatusShortResult({
			target_file: "foo.ts",
			target_mark: "missing",
			unexpected_changes: ["bar.ts"],
		});
		const parsed = JSON.parse(spy.mock.calls[0][0] as string);
		expect(parsed.status).toBe("warning");
		expect(parsed.warnings.some((w: string) => w.includes("bar.ts"))).toBe(true);
	});
});
