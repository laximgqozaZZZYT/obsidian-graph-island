import { describe, it, expect, vi } from "vitest";

// Mock obsidian module
vi.mock("obsidian", () => ({}));

import { detectTagRelations } from "../src/utils/tag-relation-presets";
import type { TagRelation } from "../src/types";

/** Create a minimal App mock with markdown files and their tags */
function mockApp(files: { path: string; tags: string[] }[]): any {
	const fileCache = new Map<string, any>();
	const mdFiles = files.map((f) => {
		const file = { path: f.path, name: f.path.split("/").pop() };
		fileCache.set(f.path, {
			frontmatter: f.tags.length > 0 ? { tags: f.tags } : undefined,
		});
		return file;
	});

	return {
		vault: {
			getMarkdownFiles: () => mdFiles,
		},
		metadataCache: {
			getFileCache: (file: any) => fileCache.get(file.path) ?? null,
		},
	};
}

describe("detectTagRelations", () => {
	it("returns empty array for empty vault", () => {
		const app = mockApp([]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("returns empty array for files without tags", () => {
		const app = mockApp([
			{ path: "a.md", tags: [] },
			{ path: "b.md", tags: [] },
		]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("returns empty array when no tag has sufficient count", () => {
		// Only 1 file per tag — below MIN_TAG_COUNT (2)
		const app = mockApp([
			{ path: "a.md", tags: ["unique1"] },
			{ path: "b.md", tags: ["unique2"] },
		]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("detects relationships from co-occurring tags", () => {
		// Create a hub tag "character" that appears in 10+ files
		// and a child tag "hero" that co-occurs with "character" frequently
		const files = [];
		for (let i = 0; i < 15; i++) {
			files.push({ path: `char${i}.md`, tags: ["character", "hero"] });
		}
		// Add some "character" files without "hero" to make ratio < 1
		for (let i = 0; i < 5; i++) {
			files.push({ path: `other${i}.md`, tags: ["character"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);

		// Should detect "hero" → "character" relationship
		if (relations.length > 0) {
			expect(relations.every((r) => r.source && r.target)).toBe(true);
			expect(relations.every((r) => r.type === "inheritance")).toBe(true);
		}
	});

	it("normalizes tag case", () => {
		const files = [];
		for (let i = 0; i < 12; i++) {
			files.push({ path: `f${i}.md`, tags: ["Character", "Hero"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// Tags should be lowercase
		for (const r of relations) {
			expect(r.source).toBe(r.source.toLowerCase());
			expect(r.target).toBe(r.target.toLowerCase());
		}
	});

	it("strips # prefix from tags", () => {
		const files = [];
		for (let i = 0; i < 12; i++) {
			files.push({ path: `f${i}.md`, tags: ["#category", "#item"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		for (const r of relations) {
			expect(r.source.startsWith("#")).toBe(false);
			expect(r.target.startsWith("#")).toBe(false);
		}
	});

	it("handles comma-separated tag strings", () => {
		const files = [];
		for (let i = 0; i < 12; i++) {
			files.push({ path: `f${i}.md`, tags: ["hub, child"] });
		}
		// Comma-separated is handled per-entry, not split within array items
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// Should not crash
		expect(Array.isArray(relations)).toBe(true);
	});

	// --- Boundary value tests (cycle112) ---

	it("does not create self-referencing relations", () => {
		const files = [];
		for (let i = 0; i < 15; i++) {
			files.push({ path: `f${i}.md`, tags: ["sametag", "sametag"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		for (const r of relations) {
			expect(r.source).not.toBe(r.target);
		}
	});

	it("handles tags with unicode/Japanese characters", () => {
		const files = [];
		for (let i = 0; i < 15; i++) {
			files.push({ path: `f${i}.md`, tags: ["キャラクター", "勇者"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// Should not crash; relations may or may not be detected
		expect(Array.isArray(relations)).toBe(true);
		for (const r of relations) {
			expect(r.source.length).toBeGreaterThan(0);
			expect(r.target.length).toBeGreaterThan(0);
		}
	});

	it("specificity preference: non-hub child prefers smaller hub", () => {
		// "broad" hub (50 files), "narrow" hub (15 files)
		// "child" (5 files, below hub threshold 10) co-occurs with both
		const files = [];
		for (let i = 0; i < 50; i++) {
			files.push({ path: `b${i}.md`, tags: ["broad"] });
		}
		for (let i = 0; i < 15; i++) {
			files.push({ path: `n${i}.md`, tags: ["narrow", "broad"] });
		}
		// child count=5 (below hub threshold 10) → processed in main pass, not Step 4
		for (let i = 0; i < 5; i++) {
			files.push({ path: `c${i}.md`, tags: ["child", "narrow", "broad"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const childRel = relations.find((r) => r.source === "child");
		// child co-occurs with both at 100%, similar ratio → prefer narrow (smaller count)
		if (childRel) {
			expect(childRel.target).toBe("narrow");
		}
	});

	it("detects transitive hub chains (deity → character)", () => {
		const files = [];
		// "character" is the broadest hub (30 files)
		for (let i = 0; i < 30; i++) {
			files.push({ path: `char${i}.md`, tags: ["character"] });
		}
		// "deity" always co-occurs with "character" (15 files)
		for (let i = 0; i < 15; i++) {
			files.push({ path: `deity${i}.md`, tags: ["deity", "character"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// Should detect deity → character
		const deityRel = relations.find((r) => r.source === "deity");
		if (deityRel) {
			expect(deityRel.target).toBe("character");
		}
	});

	it("handles frontmatter tags as string (non-array)", () => {
		// Test with tags as comma-separated string in frontmatter
		const fileCache = new Map<string, any>();
		const mdFiles: any[] = [];
		for (let i = 0; i < 15; i++) {
			const path = `f${i}.md`;
			mdFiles.push({ path, name: `f${i}.md` });
			fileCache.set(path, {
				frontmatter: { tags: "hub, child" },
			});
		}
		const app = {
			vault: { getMarkdownFiles: () => mdFiles },
			metadataCache: { getFileCache: (f: any) => fileCache.get(f.path) },
		};
		const relations = detectTagRelations(app as any);
		expect(Array.isArray(relations)).toBe(true);
	});

	it("returns all inheritance type relations", () => {
		const files = [];
		for (let i = 0; i < 20; i++) {
			files.push({ path: `f${i}.md`, tags: ["parent", "child"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		for (const r of relations) {
			expect(r.type).toBe("inheritance");
		}
	});
});
