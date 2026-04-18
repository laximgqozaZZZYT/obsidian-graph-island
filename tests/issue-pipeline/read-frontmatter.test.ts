import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../scripts/issue-pipeline/read-frontmatter.mjs");

function runScript(arg?: string) {
	const args = [SCRIPT];
	if (arg !== undefined) args.push(arg);
	return spawnSync("node", args, { encoding: "utf8" });
}

describe("scripts/issue-pipeline/read-frontmatter.mjs", () => {
	let tmpDir: string;
	let existingPath: string;
	let emptyPath: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "read-frontmatter-test-"));
		existingPath = join(tmpDir, "issue.md");
		emptyPath = join(tmpDir, "empty.md");

		const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`);
		writeFileSync(existingPath, lines.join("\n"), "utf8");
		writeFileSync(emptyPath, "", "utf8");
	});

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns JSON {path, head30} with first 30 lines for existing file", () => {
		const result = runScript(existingPath);
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		const parsed = JSON.parse(result.stdout);
		expect(parsed.path).toBe(existingPath);
		const head30Lines = parsed.head30.split("\n");
		expect(head30Lines).toHaveLength(30);
		expect(head30Lines[0]).toBe("line-1");
		expect(head30Lines[29]).toBe("line-30");
	});

	it("exits with code 2 and stderr E_NOT_FOUND when path does not exist", () => {
		const missing = join(tmpDir, "does-not-exist.md");
		const result = runScript(missing);
		expect(result.status).toBe(2);
		expect(result.stderr).toBe(`E_NOT_FOUND:${missing}`);
		expect(result.stdout).toBe("");
	});

	it("returns empty head30 string for empty file", () => {
		const result = runScript(emptyPath);
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		const parsed = JSON.parse(result.stdout);
		expect(parsed.path).toBe(emptyPath);
		expect(parsed.head30).toBe("");
	});
});
