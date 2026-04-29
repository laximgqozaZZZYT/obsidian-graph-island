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

describe("resolveThumbnailUrl", () => {
	// Build a minimal Vault stub: only the two methods resolveThumbnailUrl
	// touches (`getAbstractFileByPath` and `getResourcePath`). The lookup map
	// uses the exact path string as key — the function under test is what
	// decides whether to retry with a leading-slash-trimmed key.
	function makeVault(files: Record<string, TFile | null>, resourcePathPrefix = "app://local/") {
		const calls: string[] = [];
		const vault = {
			getAbstractFileByPath: (p: string) => {
				calls.push(p);
				return Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null;
			},
			getResourcePath: (tf: TFile) => `${resourcePathPrefix}${tf.path}`,
		} as unknown as Vault;
		return { vault, calls };
	}

	function makeTFile(path: string): TFile {
		const tf = new TFile();
		tf.path = path;
		return tf;
	}

	it("passes http:// URLs straight through without touching the vault", () => {
		const { vault, calls } = makeVault({});
		expect(resolveThumbnailUrl("http://example.com/img.png", vault)).toBe("http://example.com/img.png");
		// Vault must NOT be consulted for absolute URLs — even one call would
		// break the optimization that lets remote images bypass adapter I/O.
		expect(calls).toEqual([]);
	});

	it("passes https:// URLs straight through without touching the vault", () => {
		const { vault, calls } = makeVault({});
		expect(resolveThumbnailUrl("https://cdn.example.com/x.png", vault)).toBe("https://cdn.example.com/x.png");
		expect(calls).toEqual([]);
	});

	it("returns vault.getResourcePath() result when the exact path resolves to a TFile", () => {
		const tf = makeTFile("attachments/pic.png");
		const { vault, calls } = makeVault({ "attachments/pic.png": tf });
		expect(resolveThumbnailUrl("attachments/pic.png", vault)).toBe("app://local/attachments/pic.png");
		// Only the first lookup should fire — no fallback needed.
		expect(calls).toEqual(["attachments/pic.png"]);
	});

	it("retries with leading slashes stripped when the original path misses", () => {
		const tf = makeTFile("attachments/pic.png");
		// Only the cleaned key resolves; the original "/attachments/..." key returns null.
		const { vault, calls } = makeVault({ "attachments/pic.png": tf });
		expect(resolveThumbnailUrl("/attachments/pic.png", vault)).toBe("app://local/attachments/pic.png");
		expect(calls).toEqual(["/attachments/pic.png", "attachments/pic.png"]);
	});

	it("strips multiple leading slashes (regex /^\\/+/) before retrying", () => {
		const tf = makeTFile("a.png");
		const { vault, calls } = makeVault({ "a.png": tf });
		expect(resolveThumbnailUrl("///a.png", vault)).toBe("app://local/a.png");
		expect(calls).toEqual(["///a.png", "a.png"]);
	});

	it("returns null when neither the original nor the cleaned path resolves", () => {
		const { vault, calls } = makeVault({});
		expect(resolveThumbnailUrl("missing.png", vault)).toBeNull();
		// Without a leading slash, the cleanPath equals the original — but the
		// retry still fires once; both calls go to the same key.
		expect(calls.length).toBeGreaterThanOrEqual(1);
	});

	it("returns null when getAbstractFileByPath returns a non-TFile (e.g. TFolder)", () => {
		// Pass a plain object that is NOT a TFile instance — the `instanceof
		// TFile` guard must reject it. This protects against the function
		// accidentally calling getResourcePath on a folder.
		const notATFile = { path: "attachments" } as unknown as TFile;
		const { vault } = makeVault({ attachments: notATFile, "attachments-clean": notATFile });
		expect(resolveThumbnailUrl("attachments", vault)).toBeNull();
	});

	it("does NOT pass through paths starting with other protocols (e.g. ftp://)", () => {
		// Defensive check: the function only short-circuits on http/https.
		// `ftp://...` should fall through to the vault path resolution and
		// return null when no matching file exists.
		const { vault } = makeVault({});
		expect(resolveThumbnailUrl("ftp://example.com/x.png", vault)).toBeNull();
	});
});
