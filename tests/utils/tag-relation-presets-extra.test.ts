import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({}));

import { detectTagRelations } from "../../src/utils/tag-relation-presets";

/** Build a minimal mock App with markdown files keyed by raw frontmatter `tags` value */
function mockAppRaw(files: { path: string; rawTags: unknown }[]): any {
	const cache = new Map<string, any>();
	const mdFiles = files.map((f) => {
		cache.set(f.path, { frontmatter: { tags: f.rawTags } });
		return { path: f.path, name: f.path.split("/").pop() };
	});
	return {
		vault: { getMarkdownFiles: () => mdFiles },
		metadataCache: { getFileCache: (file: any) => cache.get(file.path) ?? null },
	};
}

/** Convenience for the standard array form */
function mockApp(files: { path: string; tags: string[] }[]): any {
	return mockAppRaw(files.map((f) => ({ path: f.path, rawTags: f.tags })));
}

// ---------------------------------------------------------------------------
// frontmatter.tags type branches
// ---------------------------------------------------------------------------
describe("detectTagRelations — frontmatter.tags type branches", () => {
	it("ignores files where tags is a number (non-array, non-string)", () => {
		const app = mockAppRaw([
			{ path: "a.md", rawTags: 42 },
			{ path: "b.md", rawTags: 7 },
		]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("ignores files where tags is an object (non-array, non-string)", () => {
		const app = mockAppRaw([
			{ path: "a.md", rawTags: { hub: true } },
			{ path: "b.md", rawTags: { other: 1 } },
		]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("ignores files where tags is null (treated as empty)", () => {
		const app = mockAppRaw([
			{ path: "a.md", rawTags: null },
			{ path: "b.md", rawTags: null },
		]);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("filters non-string entries from a mixed-type array", () => {
		// Array path: filter keeps only strings → effectively single tag per file
		const files: { path: string; rawTags: unknown }[] = [];
		for (let i = 0; i < 12; i++) {
			files.push({ path: `f${i}.md`, rawTags: ["valid-tag", 42, null, undefined, { obj: 1 }] });
		}
		const app = mockAppRaw(files);
		// Only "valid-tag" survives → no co-occurring tags → no relations
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("treats empty-string tag entries as falsy and drops them (string path)", () => {
		// "  ,  ,  " split → all-empty after filter(Boolean) → empty tags
		const files: { path: string; rawTags: unknown }[] = [];
		for (let i = 0; i < 5; i++) {
			files.push({ path: `f${i}.md`, rawTags: "  ,  ,  " });
		}
		const app = mockAppRaw(files);
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("array-of-empty-strings is filtered to empty (no continue path)", () => {
		// Pure non-string array → after filter, tags.length === 0 → continue
		const files: { path: string; rawTags: unknown }[] = [];
		for (let i = 0; i < 5; i++) {
			files.push({ path: `f${i}.md`, rawTags: [42, null, true] });
		}
		const app = mockAppRaw(files);
		expect(detectTagRelations(app)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// _findBestHub — ratio comparison branches
// ---------------------------------------------------------------------------
describe("detectTagRelations — _findBestHub ratio branches", () => {
	it("clearly-better hub (ratio > bestRatio + 0.1) overrides earlier candidate", () => {
		// "child" co-occurs ~50% with "weak-hub" but 100% with "strong-hub"
		// strong-hub ratio is clearly > weak-hub ratio + 0.1, so strong-hub wins.
		const files: { path: string; tags: string[] }[] = [];
		// 12 weak-hub-only files (so weak-hub is hub-eligible)
		for (let i = 0; i < 12; i++) files.push({ path: `wh${i}.md`, tags: ["weakhub"] });
		// 12 strong-hub-only files
		for (let i = 0; i < 12; i++) files.push({ path: `sh${i}.md`, tags: ["stronghub"] });
		// child files: always co-occur with strong-hub (100%); only some with weak-hub
		for (let i = 0; i < 8; i++) {
			// 4 files: child + strong-hub + weak-hub
			if (i < 4) files.push({ path: `ch${i}.md`, tags: ["child", "stronghub", "weakhub"] });
			// 4 files: child + strong-hub only
			else files.push({ path: `ch${i}.md`, tags: ["child", "stronghub"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const childRel = relations.find((r) => r.source === "child");
		// child→stronghub (ratio 100%) chosen over weakhub (ratio 50%)
		expect(childRel?.target).toBe("stronghub");
	});

	it("similar-ratio hubs prefer the smaller-count hub (specificity)", () => {
		// Both hubs co-occur 100% with child; smaller hub wins via the
		// `ratio >= bestRatio - 0.1 && hubCount < bestHubCount` branch.
		const files: { path: string; tags: string[] }[] = [];
		// bighub: 30 files
		for (let i = 0; i < 30; i++) files.push({ path: `bh${i}.md`, tags: ["bighub"] });
		// smallhub: 12 files (still hub-eligible)
		for (let i = 0; i < 12; i++) files.push({ path: `sh${i}.md`, tags: ["smallhub"] });
		// child always co-occurs with both → ratio identical
		for (let i = 0; i < 8; i++) {
			files.push({ path: `ch${i}.md`, tags: ["child", "bighub", "smallhub"] });
		}
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const childRel = relations.find((r) => r.source === "child");
		expect(childRel?.target).toBe("smallhub");
	});

	it("preserves existing best when new candidate ratio is clearly worse (keep-current branch)", () => {
		// Iteration order: hubCandidates sorted by descending count.
		// First-seen hub becomes bestHub; subsequent worse hubs hit the
		// "keep current" implicit branch (no condition fires).
		const files: { path: string; tags: string[] }[] = [];
		// hubA: 50 (first in sorted hubCandidates)
		for (let i = 0; i < 50; i++) files.push({ path: `a${i}.md`, tags: ["hubalpha"] });
		// hubB: 20
		for (let i = 0; i < 20; i++) files.push({ path: `b${i}.md`, tags: ["hubbeta"] });
		// child: count 6 → not a hub, but processed in main pass.
		// Co-occur 100% with A, 0% with B.
		for (let i = 0; i < 6; i++) files.push({ path: `c${i}.md`, tags: ["child", "hubalpha"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const childRel = relations.find((r) => r.source === "child");
		// hubalpha wins; hubbeta is skipped via ratio < MIN_COOCCURRENCE_RATIO so the comparison
		// branch isn't even reached. Confirms primary best-hub assignment.
		expect(childRel?.target).toBe("hubalpha");
	});
});

// ---------------------------------------------------------------------------
// _buildHubTransitiveChains — `if (!hubCooc) continue` branch
// ---------------------------------------------------------------------------
describe("detectTagRelations — transitive-chain edge cases", () => {
	it("handles hubs whose Step-3 assignment removes them from Step-4 consideration", () => {
		// "mid" gets assigned to "broad" in Step 3 → assigned.has(mid) → Step 4 skips it.
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 30; i++) files.push({ path: `b${i}.md`, tags: ["broad"] });
		// "mid" hub-eligible (count=12) and always co-occurs with "broad" → assigned in Step 3
		// (Step 3 processes non-hub tags only, so "mid" being a hub means Step 3 SKIPS it.)
		// Step 4 then handles mid → broad transitive chain.
		for (let i = 0; i < 12; i++) files.push({ path: `m${i}.md`, tags: ["mid", "broad"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const midRel = relations.find((r) => r.source === "mid");
		expect(midRel?.target).toBe("broad");
	});

	it("does not chain when broader hub has count <= hub's own count", () => {
		// hubalpha: 15, hubbeta: 10 → A is broader by count.
		// For hubbeta as the inner: broaderCount(=15) > hubTotal(=10) → eligible.
		// For hubalpha as the inner: broaderCount(=10) <= hubTotal(=15) → skipped via the
		// `broaderCount <= hubTotal` continue branch.
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 5; i++) files.push({ path: `a${i}.md`, tags: ["hubalpha"] });
		for (let i = 0; i < 10; i++) files.push({ path: `ab${i}.md`, tags: ["hubalpha", "hubbeta"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// At most one relation: hubbeta → hubalpha (since A is broader). Never reverse.
		const reverseRel = relations.find((r) => r.source === "hubalpha" && r.target === "hubbeta");
		expect(reverseRel).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// deduplicateAndValidate — duplicate key + cycle branches
// ---------------------------------------------------------------------------
describe("detectTagRelations — dedup/cycle protection", () => {
	it("does not emit duplicate (source, target, type) triples", () => {
		// With heavy co-occurrence the upstream may not produce duplicates,
		// but we still verify the result has unique keys as an invariant.
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 20; i++) files.push({ path: `f${i}.md`, tags: ["parent", "child"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		const seen = new Set<string>();
		for (const r of relations) {
			const key = `${r.source}|${r.target}|${r.type}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it("never emits self-references (source !== target)", () => {
		// Three-tag chain with high co-occurrence — should produce a chain,
		// never a self-edge.
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 30; i++) files.push({ path: `g${i}.md`, tags: ["grandparent"] });
		for (let i = 0; i < 20; i++) files.push({ path: `p${i}.md`, tags: ["parent", "grandparent"] });
		for (let i = 0; i < 12; i++) files.push({ path: `c${i}.md`, tags: ["child", "parent", "grandparent"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		for (const r of relations) {
			expect(r.source).not.toBe(r.target);
		}
	});

	it("blocks reverse-direction relation when broader→narrower would invert the chain", () => {
		// Two hubs co-occur 100% with each other but Y is strictly broader (higher count).
		// Step-4: only X→Y is emitted (because broaderCount must be > hubTotal).
		// The reverse Y→X is filtered by the `broaderCount <= hubTotal` continue branch.
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 12; i++) files.push({ path: `xy${i}.md`, tags: ["hubx", "huby"] });
		for (let i = 0; i < 5; i++) files.push({ path: `y${i}.md`, tags: ["huby"] });
		const app = mockApp(files);
		const relations = detectTagRelations(app);
		// At most: hubx → huby. Reverse direction must not appear.
		const xy = relations.find((r) => r.source === "hubx" && r.target === "huby");
		const yx = relations.find((r) => r.source === "huby" && r.target === "hubx");
		expect(yx).toBeUndefined();
		if (xy) expect(xy.type).toBe("inheritance");
	});
});

// ---------------------------------------------------------------------------
// Smoke: exotic shapes don't throw
// ---------------------------------------------------------------------------
describe("detectTagRelations — robustness", () => {
	it("handles a vault of 0 files without throwing", () => {
		expect(() => detectTagRelations(mockApp([]))).not.toThrow();
	});

	it("handles a single file with 50+ unique tags", () => {
		const tags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
		const app = mockApp([{ path: "huge.md", tags }]);
		// All tags have count=1 (< MIN_TAG_COUNT) → no relations
		expect(detectTagRelations(app)).toEqual([]);
	});

	it("handles deeply duplicated tags within a single file", () => {
		// Same tag repeated within the array → Set normalization collapses it
		const files: { path: string; tags: string[] }[] = [];
		for (let i = 0; i < 5; i++) {
			files.push({ path: `f${i}.md`, tags: ["dup", "dup", "dup", "dup"] });
		}
		const app = mockApp(files);
		// "dup" alone — no co-occurrence partner → no relations
		expect(detectTagRelations(app)).toEqual([]);
	});
});
