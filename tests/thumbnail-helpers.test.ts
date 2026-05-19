import { describe, it, expect, vi } from "vitest";
import { extractFrontmatterImage, isNodeOnScreen, createThumbnailClone, resolveThumbnailUrl } from "../src/views/thumbnail-helpers";
import { TFile } from "./__mocks__/obsidian";

// ---------------------------------------------------------------------------
// Image mock for createThumbnailClone (no jsdom in this test environment)
// ---------------------------------------------------------------------------
class MockImage {
	src = "";
	className = "";
	style: Record<string, string> = {};
}
(global as any).Image = MockImage;

// ---------------------------------------------------------------------------
// extractFrontmatterImage
// ---------------------------------------------------------------------------

describe("extractFrontmatterImage", () => {
	it("returns null for undefined meta", () => {
		expect(extractFrontmatterImage(undefined)).toBeNull();
	});

	it("returns null when no image/thumbnail/cover key exists", () => {
		expect(extractFrontmatterImage({ title: "hello", author: "bob" })).toBeNull();
	});

	it("extracts 'image' field", () => {
		expect(extractFrontmatterImage({ image: "img.png" })).toBe("img.png");
	});

	it("extracts 'thumbnail' field when image is absent", () => {
		expect(extractFrontmatterImage({ thumbnail: "thumb.webp" })).toBe("thumb.webp");
	});

	it("extracts 'cover' field when image and thumbnail are absent", () => {
		expect(extractFrontmatterImage({ cover: "cover.jpg" })).toBe("cover.jpg");
	});

	it("prefers 'image' over 'thumbnail' and 'cover'", () => {
		expect(extractFrontmatterImage({ image: "a.png", thumbnail: "b.png", cover: "c.png" })).toBe("a.png");
	});

	it("returns null when image field exists but is not a string (number)", () => {
		expect(extractFrontmatterImage({ image: 42 })).toBeNull();
	});

	it("returns null when image field is null", () => {
		expect(extractFrontmatterImage({ image: null })).toBeNull();
	});

	it("returns null when image field is an empty string", () => {
		// empty string is falsy — treated as absent
		expect(extractFrontmatterImage({ image: "" })).toBeNull();
	});

	it("returns null when image is a non-string truthy value (boolean true)", () => {
		// `true ?? thumbnail` resolves to `true`, which fails the typeof check → null
		expect(extractFrontmatterImage({ image: true, thumbnail: "t.png" })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// isNodeOnScreen
// ---------------------------------------------------------------------------

describe("isNodeOnScreen", () => {
	it("returns true for a point at the origin with zero margin", () => {
		expect(isNodeOnScreen(0, 0, 800, 600, 0)).toBe(true);
	});

	it("returns true for a point at the far corner (vw, vh) with zero margin", () => {
		expect(isNodeOnScreen(800, 600, 800, 600, 0)).toBe(true);
	});

	it("returns true for a point well inside the viewport", () => {
		expect(isNodeOnScreen(400, 300, 800, 600, 0)).toBe(true);
	});

	it("returns false when x is just left of the viewport", () => {
		expect(isNodeOnScreen(-1, 300, 800, 600, 0)).toBe(false);
	});

	it("returns false when x is just right of the viewport", () => {
		expect(isNodeOnScreen(801, 300, 800, 600, 0)).toBe(false);
	});

	it("returns false when y is just above the viewport", () => {
		expect(isNodeOnScreen(400, -1, 800, 600, 0)).toBe(false);
	});

	it("returns false when y is just below the viewport", () => {
		expect(isNodeOnScreen(400, 601, 800, 600, 0)).toBe(false);
	});

	it("allows a node slightly outside the viewport when margin > 0", () => {
		expect(isNodeOnScreen(-5, 300, 800, 600, 10)).toBe(true);
	});

	it("margin extends all four sides symmetrically", () => {
		const m = 20;
		expect(isNodeOnScreen(-20, 300, 800, 600, m)).toBe(true);
		expect(isNodeOnScreen(820, 300, 800, 600, m)).toBe(true);
		expect(isNodeOnScreen(400, -20, 800, 600, m)).toBe(true);
		expect(isNodeOnScreen(400, 620, 800, 600, m)).toBe(true);
		// just outside the margin
		expect(isNodeOnScreen(-21, 300, 800, 600, m)).toBe(false);
		expect(isNodeOnScreen(821, 300, 800, 600, m)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// createThumbnailClone
// ---------------------------------------------------------------------------

describe("createThumbnailClone", () => {
	it("copies src from the source image", () => {
		const img = new MockImage();
		img.src = "vault/image.png";
		const clone = createThumbnailClone(img as any, 0, 0, 50) as unknown as MockImage;
		expect(clone.src).toBe("vault/image.png");
	});

	it("assigns gi-node-thumbnail class", () => {
		const img = new MockImage();
		const clone = createThumbnailClone(img as any, 0, 0, 50) as unknown as MockImage;
		expect(clone.className).toBe("gi-node-thumbnail");
	});

	it("sets width and height equal to size", () => {
		const img = new MockImage();
		const clone = createThumbnailClone(img as any, 0, 0, 80) as unknown as MockImage;
		expect(clone.style.width).toBe("80px");
		expect(clone.style.height).toBe("80px");
	});

	it("positions the clone centered on (sx, sy)", () => {
		const img = new MockImage();
		// center at (100, 200), size 60 → left = 100-30 = 70, top = 200-30 = 170
		const clone = createThumbnailClone(img as any, 100, 200, 60) as unknown as MockImage;
		expect(clone.style.left).toBe("70px");
		expect(clone.style.top).toBe("170px");
	});

	it("handles odd size (rounds via template literal)", () => {
		const img = new MockImage();
		const clone = createThumbnailClone(img as any, 50, 50, 51) as unknown as MockImage;
		// left = 50 - 25.5 = 24.5
		expect(clone.style.left).toBe("24.5px");
		expect(clone.style.top).toBe("24.5px");
	});
});

// ---------------------------------------------------------------------------
// resolveThumbnailUrl
// ---------------------------------------------------------------------------

describe("resolveThumbnailUrl", () => {
	it("returns http URL without vault lookup", () => {
		const vault = { getAbstractFileByPath: vi.fn() } as any;
		const result = resolveThumbnailUrl("http://example.com/img.png", vault);
		expect(result).toBe("http://example.com/img.png");
		expect(vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	it("returns https URL without vault lookup", () => {
		const vault = { getAbstractFileByPath: vi.fn() } as any;
		const result = resolveThumbnailUrl("https://cdn.example.com/pic.jpg", vault);
		expect(result).toBe("https://cdn.example.com/pic.jpg");
		expect(vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	it("resolves a local path via vault when TFile is found", () => {
		const tf = new TFile();
		tf.path = "images/photo.png";
		const vault = {
			getAbstractFileByPath: vi.fn((p: string) => (p === "images/photo.png" ? tf : null)),
			getResourcePath: vi.fn(() => "resource://photo.png"),
		} as any;
		expect(resolveThumbnailUrl("images/photo.png", vault)).toBe("resource://photo.png");
		expect(vault.getResourcePath).toHaveBeenCalledWith(tf);
	});

	it("strips a leading slash and retries when first lookup fails", () => {
		const tf = new TFile();
		tf.path = "images/photo.png";
		const vault = {
			getAbstractFileByPath: vi.fn((p: string) => (p === "images/photo.png" ? tf : null)),
			getResourcePath: vi.fn(() => "resource://photo.png"),
		} as any;
		// First call uses "/images/photo.png" (not found), second uses "images/photo.png" (found).
		const result = resolveThumbnailUrl("/images/photo.png", vault);
		expect(result).toBe("resource://photo.png");
		expect(vault.getAbstractFileByPath).toHaveBeenCalledWith("/images/photo.png");
		expect(vault.getAbstractFileByPath).toHaveBeenCalledWith("images/photo.png");
	});

	it("returns null when the file is not found in the vault", () => {
		const vault = {
			getAbstractFileByPath: vi.fn(() => null),
			getResourcePath: vi.fn(),
		} as any;
		expect(resolveThumbnailUrl("missing/file.png", vault)).toBeNull();
		expect(vault.getResourcePath).not.toHaveBeenCalled();
	});

	it("returns null for a path with a leading slash when stripped path is also missing", () => {
		const vault = {
			getAbstractFileByPath: vi.fn(() => null),
			getResourcePath: vi.fn(),
		} as any;
		expect(resolveThumbnailUrl("/does/not/exist.png", vault)).toBeNull();
	});
});
