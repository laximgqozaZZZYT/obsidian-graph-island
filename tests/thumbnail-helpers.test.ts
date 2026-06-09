/**
 * Tests for src/views/thumbnail-helpers.ts
 *
 * Tests the four exported pure/near-pure functions:
 *   - extractFrontmatterImage
 *   - isNodeOnScreen
 *   - createThumbnailClone
 *   - resolveThumbnailUrl
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractFrontmatterImage, isNodeOnScreen, createThumbnailClone, resolveThumbnailUrl } from "../src/views/thumbnail-helpers";
import { TFile } from "obsidian";

// ---------------------------------------------------------------------------
// extractFrontmatterImage
// ---------------------------------------------------------------------------

describe("extractFrontmatterImage", () => {
	it("returns null for undefined meta", () => {
		expect(extractFrontmatterImage(undefined)).toBeNull();
	});

	it("returns null for empty meta object", () => {
		expect(extractFrontmatterImage({})).toBeNull();
	});

	it("extracts 'image' field", () => {
		expect(extractFrontmatterImage({ image: "assets/photo.jpg" })).toBe("assets/photo.jpg");
	});

	it("extracts 'thumbnail' field when no image field", () => {
		expect(extractFrontmatterImage({ thumbnail: "thumb.png" })).toBe("thumb.png");
	});

	it("extracts 'cover' field when no image or thumbnail", () => {
		expect(extractFrontmatterImage({ cover: "cover.jpg" })).toBe("cover.jpg");
	});

	it("prefers 'image' over 'thumbnail'", () => {
		expect(extractFrontmatterImage({ image: "img.jpg", thumbnail: "thumb.jpg" })).toBe("img.jpg");
	});

	it("prefers 'image' over 'cover'", () => {
		expect(extractFrontmatterImage({ image: "img.jpg", cover: "cover.jpg" })).toBe("img.jpg");
	});

	it("returns null when value is not a string", () => {
		expect(extractFrontmatterImage({ image: 42 })).toBeNull();
		expect(extractFrontmatterImage({ image: null })).toBeNull();
		expect(extractFrontmatterImage({ image: {} })).toBeNull();
	});

	it("returns null when all fields are non-strings", () => {
		expect(extractFrontmatterImage({ thumbnail: false, cover: null })).toBeNull();
	});

	it("handles empty string image field (falsy)", () => {
		expect(extractFrontmatterImage({ image: "" })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// isNodeOnScreen
// ---------------------------------------------------------------------------

describe("isNodeOnScreen", () => {
	const vw = 800;
	const vh = 600;
	const margin = 50;

	it("returns true for a node at center of screen", () => {
		expect(isNodeOnScreen(400, 300, vw, vh, margin)).toBe(true);
	});

	it("returns true for a node at top-left corner", () => {
		expect(isNodeOnScreen(0, 0, vw, vh, margin)).toBe(true);
	});

	it("returns true for a node within margin (left side)", () => {
		expect(isNodeOnScreen(-margin, 300, vw, vh, margin)).toBe(true);
	});

	it("returns true for a node within margin (right side)", () => {
		expect(isNodeOnScreen(vw + margin, 300, vw, vh, margin)).toBe(true);
	});

	it("returns true for a node within margin (top)", () => {
		expect(isNodeOnScreen(400, -margin, vw, vh, margin)).toBe(true);
	});

	it("returns true for a node within margin (bottom)", () => {
		expect(isNodeOnScreen(400, vh + margin, vw, vh, margin)).toBe(true);
	});

	it("returns false for a node too far to the left", () => {
		expect(isNodeOnScreen(-margin - 1, 300, vw, vh, margin)).toBe(false);
	});

	it("returns false for a node too far to the right", () => {
		expect(isNodeOnScreen(vw + margin + 1, 300, vw, vh, margin)).toBe(false);
	});

	it("returns false for a node too far above", () => {
		expect(isNodeOnScreen(400, -margin - 1, vw, vh, margin)).toBe(false);
	});

	it("returns false for a node too far below", () => {
		expect(isNodeOnScreen(400, vh + margin + 1, vw, vh, margin)).toBe(false);
	});

	it("returns false for margin=0 when node is at -1", () => {
		expect(isNodeOnScreen(-1, 300, vw, vh, 0)).toBe(false);
	});

	it("returns true for margin=0 when node is at 0", () => {
		expect(isNodeOnScreen(0, 300, vw, vh, 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// createThumbnailClone — requires HTMLImageElement mock
// ---------------------------------------------------------------------------

/**
 * Minimal HTMLImageElement stand-in for Node environment.
 * The real createThumbnailClone calls `new Image()` internally.
 */
class MockImage {
	src = "";
	className = "";
	style: Record<string, string> = {};
}

// Polyfill Image globally so createThumbnailClone can call `new Image()`
(global as any).Image = MockImage;

describe("createThumbnailClone", () => {
	let srcImage: any;

	beforeEach(() => {
		srcImage = new MockImage();
		srcImage.src = "http://example.com/photo.jpg";
	});

	it("returns an image-like object", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 40);
		expect(clone).toBeDefined();
		expect(clone).toBeInstanceOf(MockImage);
	});

	it("copies the src from the source image", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 40);
		expect(clone.src).toBe("http://example.com/photo.jpg");
	});

	it("sets the gi-node-thumbnail CSS class", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 40);
		expect(clone.className).toBe("gi-node-thumbnail");
	});

	it("applies correct width style", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 40);
		expect(clone.style.width).toBe("40px");
	});

	it("applies correct height style", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 40);
		expect(clone.style.height).toBe("40px");
	});

	it("positions the clone centered at (sx, sy)", () => {
		const sx = 100, sy = 200, size = 40;
		const clone = createThumbnailClone(srcImage as any, sx, sy, size);
		expect(clone.style.left).toBe(`${sx - size / 2}px`);
		expect(clone.style.top).toBe(`${sy - size / 2}px`);
	});

	it("handles size=0 without error", () => {
		const clone = createThumbnailClone(srcImage as any, 100, 200, 0);
		expect(clone.style.width).toBe("0px");
		expect(clone.style.height).toBe("0px");
	});
});

// ---------------------------------------------------------------------------
// resolveThumbnailUrl
// ---------------------------------------------------------------------------

describe("resolveThumbnailUrl", () => {
	function makeVault(file: TFile | null = null) {
		const getAbstractFileByPath = vi.fn().mockReturnValue(file);
		const getResourcePath = vi.fn((f: TFile) => `app://local/${f.path}`);
		return { getAbstractFileByPath, getResourcePath };
	}

	it("returns http:// URL as-is (no vault lookup)", () => {
		const vault = makeVault();
		const result = resolveThumbnailUrl("http://example.com/image.jpg", vault as any);
		expect(result).toBe("http://example.com/image.jpg");
		expect(vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	it("returns https:// URL as-is (no vault lookup)", () => {
		const vault = makeVault();
		const result = resolveThumbnailUrl("https://cdn.example.com/img.png", vault as any);
		expect(result).toBe("https://cdn.example.com/img.png");
		expect(vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	it("returns resource path when path resolves to a TFile", () => {
		const file = new TFile();
		(file as any).path = "assets/photo.jpg";
		const vault = makeVault(file);

		const result = resolveThumbnailUrl("assets/photo.jpg", vault as any);
		expect(result).toBe("app://local/assets/photo.jpg");
	});

	it("strips leading slash and retries when first lookup fails", () => {
		const file = new TFile();
		(file as any).path = "assets/photo.jpg";
		const vault = {
			getAbstractFileByPath: vi.fn()
				.mockReturnValueOnce(null) // first call with leading slash fails
				.mockReturnValueOnce(file), // second call with clean path succeeds
			getResourcePath: vi.fn((f: TFile) => `app://local/${(f as any).path}`),
		};

		const result = resolveThumbnailUrl("/assets/photo.jpg", vault as any);
		expect(vault.getAbstractFileByPath).toHaveBeenCalledTimes(2);
		expect(result).toBe("app://local/assets/photo.jpg");
	});

	it("returns null when path cannot be resolved in vault", () => {
		const vault = makeVault(null);
		const result = resolveThumbnailUrl("nonexistent/path.jpg", vault as any);
		expect(result).toBeNull();
	});

	it("returns null for both attempts with leading slash path that doesn't exist", () => {
		const vault = makeVault(null);
		const result = resolveThumbnailUrl("/nonexistent.jpg", vault as any);
		expect(result).toBeNull();
	});
});
