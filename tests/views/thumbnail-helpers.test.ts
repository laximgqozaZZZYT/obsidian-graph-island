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
import { TFile, type Vault } from "obsidian";
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

describe("resolveThumbnailUrl", () => {
	// Build a minimal Vault stub. We accept a map of path → TFile|null; missing
	// keys resolve to null. `getResourcePath` echoes the file's path with a
	// scheme so we can assert which lookup path won.
	function makeVault(files: Record<string, TFile | null>): Vault {
		return {
			getAbstractFileByPath: (p: string) => (p in files ? files[p] : null),
			getResourcePath: (f: TFile) => `app://local/${f.path}`,
		} as unknown as Vault;
	}

	function makeFile(path: string): TFile {
		const f = new TFile();
		f.path = path;
		return f;
	}

	it("returns http:// URLs unchanged without consulting the vault", () => {
		// Vault would throw if touched: confirms the early-return branch.
		const vault = {
			getAbstractFileByPath: () => {
				throw new Error("should not be called");
			},
			getResourcePath: () => {
				throw new Error("should not be called");
			},
		} as unknown as Vault;
		expect(resolveThumbnailUrl("http://example.com/i.png", vault)).toBe("http://example.com/i.png");
	});

	it("returns https:// URLs unchanged without consulting the vault", () => {
		const vault = {
			getAbstractFileByPath: () => {
				throw new Error("should not be called");
			},
			getResourcePath: () => {
				throw new Error("should not be called");
			},
		} as unknown as Vault;
		expect(resolveThumbnailUrl("https://example.com/i.png", vault)).toBe("https://example.com/i.png");
	});

	it("resolves a direct vault path via getAbstractFileByPath + getResourcePath", () => {
		const tf = makeFile("folder/img.png");
		const vault = makeVault({ "folder/img.png": tf });
		expect(resolveThumbnailUrl("folder/img.png", vault)).toBe("app://local/folder/img.png");
	});

	it("strips a leading slash and retries when the direct lookup fails", () => {
		// First lookup ("/img.png") returns null; cleaned lookup ("img.png") hits.
		const tf = makeFile("img.png");
		const vault = makeVault({ "/img.png": null, "img.png": tf });
		expect(resolveThumbnailUrl("/img.png", vault)).toBe("app://local/img.png");
	});

	it("strips multiple leading slashes via the /^\\/+/ regex", () => {
		const tf = makeFile("img.png");
		const vault = makeVault({ "///img.png": null, "img.png": tf });
		expect(resolveThumbnailUrl("///img.png", vault)).toBe("app://local/img.png");
	});

	it("returns null when neither the direct nor the cleaned path resolves to a TFile", () => {
		const vault = makeVault({});
		expect(resolveThumbnailUrl("missing/img.png", vault)).toBeNull();
		expect(resolveThumbnailUrl("/missing.png", vault)).toBeNull();
	});

	it("returns null when getAbstractFileByPath returns a non-TFile (e.g., a folder)", () => {
		// instanceof TFile must guard against folders/AbstractFile siblings.
		const notATFile = { path: "img.png" } as unknown as TFile;
		const vault = makeVault({ "img.png": notATFile });
		expect(resolveThumbnailUrl("img.png", vault)).toBeNull();
	});

	it("does not strip slashes that are not at the start (path with internal slashes preserved)", () => {
		// Confirms the regex only anchors at ^; internal "/" stays put.
		const tf = makeFile("a/b/c.png");
		const vault = makeVault({ "a/b/c.png": tf });
		expect(resolveThumbnailUrl("a/b/c.png", vault)).toBe("app://local/a/b/c.png");
	});
});
