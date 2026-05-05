/**
 * Unit tests for src/views/thumbnail-helpers.ts
 *
 * Scope (subtask of 144-coverage-drop):
 *   Covers the pure helpers that back node thumbnail rendering:
 *    - extractFrontmatterImage: image > thumbnail > cover priority +
 *      null/undefined/non-string rejection.
 *    - isNodeOnScreen: 2D rect-containment with a margin band.
 *    - createThumbnailClone: DOM helper that builds a centered <img> clone
 *      from a source HTMLImageElement; tested under a minimal Image stub
 *      (no jsdom — keeps the mock footprint consistent with the rest of
 *      the suite).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import {
	extractFrontmatterImage,
	isNodeOnScreen,
	createThumbnailClone,
	resolveThumbnailUrl,
} from "../../src/views/thumbnail-helpers";

describe("extractFrontmatterImage", () => {
	it("prefers `image` over `thumbnail` and `cover`", () => {
		const res = extractFrontmatterImage({
			image: "img.png",
			thumbnail: "thumb.png",
			cover: "cover.png",
		});
		expect(res).toBe("img.png");
	});

	it("falls back to `thumbnail` when `image` is missing", () => {
		const res = extractFrontmatterImage({ thumbnail: "thumb.png", cover: "cover.png" });
		expect(res).toBe("thumb.png");
	});

	it("falls back to `cover` when both `image` and `thumbnail` are missing", () => {
		const res = extractFrontmatterImage({ cover: "cover.png" });
		expect(res).toBe("cover.png");
	});

	it("returns null when meta is undefined", () => {
		expect(extractFrontmatterImage(undefined)).toBeNull();
	});

	it("returns null when all keys are missing or null", () => {
		expect(extractFrontmatterImage({})).toBeNull();
		expect(extractFrontmatterImage({ image: null })).toBeNull();
	});

	it("falls back from null `image` to `thumbnail` (?? semantics, not ||)", () => {
		// Guards against a regression where `??` is rewritten to `||`: `||` would
		// also fall through on `""`, changing behavior for intentional empty strings.
		expect(extractFrontmatterImage({ image: null, thumbnail: "thumb.png" })).toBe("thumb.png");
	});

	it("rejects non-string image values (number, object, array)", () => {
		expect(extractFrontmatterImage({ image: 42 })).toBeNull();
		expect(extractFrontmatterImage({ image: { path: "x.png" } })).toBeNull();
		expect(extractFrontmatterImage({ image: ["x.png"] })).toBeNull();
	});

	it("rejects empty string (falsy guard triggers null return)", () => {
		expect(extractFrontmatterImage({ image: "" })).toBeNull();
	});
});

describe("isNodeOnScreen", () => {
	const vw = 800;
	const vh = 600;
	const margin = 50;

	it("returns true when the point is well inside the viewport", () => {
		expect(isNodeOnScreen(400, 300, vw, vh, margin)).toBe(true);
	});

	it("returns true when the point sits exactly at the margin boundary", () => {
		expect(isNodeOnScreen(-margin, -margin, vw, vh, margin)).toBe(true);
		expect(isNodeOnScreen(vw + margin, vh + margin, vw, vh, margin)).toBe(true);
	});

	it("returns false when the point is just past the left/top margin", () => {
		expect(isNodeOnScreen(-margin - 1, 100, vw, vh, margin)).toBe(false);
		expect(isNodeOnScreen(100, -margin - 1, vw, vh, margin)).toBe(false);
	});

	it("returns false when the point is just past the right/bottom margin", () => {
		expect(isNodeOnScreen(vw + margin + 1, 100, vw, vh, margin)).toBe(false);
		expect(isNodeOnScreen(100, vh + margin + 1, vw, vh, margin)).toBe(false);
	});

	it("treats margin=0 as strict containment (boundary still inclusive)", () => {
		expect(isNodeOnScreen(0, 0, vw, vh, 0)).toBe(true);
		expect(isNodeOnScreen(vw, vh, vw, vh, 0)).toBe(true);
		expect(isNodeOnScreen(-1, 0, vw, vh, 0)).toBe(false);
	});
});

describe("createThumbnailClone", () => {
	// Stub `Image` so we don't need jsdom — matches the rest of the test suite.
	let originalImage: typeof globalThis.Image | undefined;

	beforeAll(() => {
		originalImage = (globalThis as unknown as { Image?: typeof globalThis.Image }).Image;
		class StubImage {
			src = "";
			className = "";
			style: Record<string, string> = {};
		}
		(globalThis as unknown as { Image: unknown }).Image = StubImage;
	});

	afterAll(() => {
		if (originalImage) {
			(globalThis as unknown as { Image: typeof globalThis.Image }).Image = originalImage;
		} else {
			delete (globalThis as { Image?: unknown }).Image;
		}
	});

	function makeSrcImg(src: string): HTMLImageElement {
		return { src } as unknown as HTMLImageElement;
	}

	it("copies src from the source image and sets the standard class name", () => {
		const clone = createThumbnailClone(makeSrcImg("file.png"), 100, 100, 40);
		expect(clone.src).toBe("file.png");
		expect(clone.className).toBe("gi-node-thumbnail");
	});

	it("sizes the clone to the requested size (px)", () => {
		const clone = createThumbnailClone(makeSrcImg("x.png"), 0, 0, 64);
		expect(clone.style.width).toBe("64px");
		expect(clone.style.height).toBe("64px");
	});

	it("centers the clone on (sx, sy) by offsetting left/top by -size/2", () => {
		const clone = createThumbnailClone(makeSrcImg("x.png"), 200, 150, 40);
		expect(clone.style.left).toBe(`${200 - 40 / 2}px`);
		expect(clone.style.top).toBe(`${150 - 40 / 2}px`);
	});

	it("produces a different instance than the source image (true clone, not mutation)", () => {
		const src = makeSrcImg("orig.png");
		const clone = createThumbnailClone(src, 10, 20, 30);
		expect(clone).not.toBe(src);
		expect(src).toEqual({ src: "orig.png" });
	});
});

// ---------------------------------------------------------------------------
// resolveThumbnailUrl — boundary tests
// 4 ブランチを境界値でカバー: HTTP通過 / 直接パスヒット / 先頭スラッシュ除去後ヒット / null
// ---------------------------------------------------------------------------
describe("resolveThumbnailUrl", () => {
	// Build a Vault stub with controllable getAbstractFileByPath + getResourcePath.
	function makeVault(opts: { registry?: Record<string, unknown>; resourcePath?: (tf: TFile) => string }): Vault {
		const registry = opts.registry ?? {};
		const resourcePath = opts.resourcePath ?? ((_tf: TFile) => "app://local/resolved");
		return {
			getAbstractFileByPath: (p: string) => registry[p] ?? null,
			getResourcePath: (tf: TFile) => resourcePath(tf),
		} as unknown as Vault;
	}

	it("returns http:// URL unchanged without touching the vault", () => {
		const vault = makeVault({});
		expect(resolveThumbnailUrl("http://example.com/img.png", vault)).toBe("http://example.com/img.png");
	});

	it("returns https:// URL unchanged without touching the vault", () => {
		const vault = makeVault({});
		expect(resolveThumbnailUrl("https://example.com/cdn/img.jpg", vault)).toBe("https://example.com/cdn/img.jpg");
	});

	it("resolves direct vault path through getResourcePath", () => {
		const tf = new TFile();
		tf.path = "Assets/photo.png";
		const vault = makeVault({
			registry: { "Assets/photo.png": tf },
			resourcePath: (t) => `app://local/${(t as TFile).path}`,
		});
		expect(resolveThumbnailUrl("Assets/photo.png", vault)).toBe("app://local/Assets/photo.png");
	});

	it("strips leading slash and retries lookup (cleanPath fallback)", () => {
		const tf = new TFile();
		tf.path = "img.png";
		const vault = makeVault({
			// Only the cleaned (no-leading-slash) path resolves.
			registry: { "img.png": tf },
			resourcePath: () => "app://local/img.png",
		});
		expect(resolveThumbnailUrl("/img.png", vault)).toBe("app://local/img.png");
	});

	it("strips multiple leading slashes (regex /^\\/+/) before retry", () => {
		const tf = new TFile();
		const vault = makeVault({
			registry: { "deep/file.png": tf },
			resourcePath: () => "app://local/deep/file.png",
		});
		expect(resolveThumbnailUrl("///deep/file.png", vault)).toBe("app://local/deep/file.png");
	});

	it("returns null when path is not in vault (both direct and cleaned lookups miss)", () => {
		const vault = makeVault({ registry: {} });
		expect(resolveThumbnailUrl("missing.png", vault)).toBeNull();
		expect(resolveThumbnailUrl("/missing.png", vault)).toBeNull();
	});

	it("returns null when getAbstractFileByPath returns a non-TFile (e.g. folder)", () => {
		// A TFolder (or any non-TFile object) should fail the `instanceof TFile` guard.
		class TFolder {}
		const folder = new TFolder();
		const vault = makeVault({ registry: { "folder/sub": folder } });
		expect(resolveThumbnailUrl("folder/sub", vault)).toBeNull();
	});

	it("does not strip leading slashes for absolute http(s) URLs (URL guard takes precedence)", () => {
		// Although https:// has slashes, the URL prefix check fires first → no vault lookup.
		const vault = makeVault({ registry: {} });
		expect(resolveThumbnailUrl("https://x.test/a.png", vault)).toBe("https://x.test/a.png");
	});

	it("treats path with no leading slash and direct match as primary lookup (no cleanup retry)", () => {
		// Verifies the early-return on the primary lookup — second lookup is skipped.
		const tf = new TFile();
		let primaryCalls = 0;
		const vault = {
			getAbstractFileByPath: (p: string) => {
				primaryCalls++;
				return p === "exact.png" ? tf : null;
			},
			getResourcePath: () => "app://local/exact.png",
		} as unknown as Vault;
		expect(resolveThumbnailUrl("exact.png", vault)).toBe("app://local/exact.png");
		// Only one call: cleanPath retry is short-circuited because primary hit.
		expect(primaryCalls).toBe(1);
	});
});
