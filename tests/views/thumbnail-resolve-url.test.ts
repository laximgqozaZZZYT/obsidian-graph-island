/**
 * Unit tests for resolveThumbnailUrl in src/views/thumbnail-helpers.ts.
 *
 * The existing thumbnail-helpers.test.ts covers extractFrontmatterImage,
 * isNodeOnScreen, and createThumbnailClone. This file covers the
 * vault-dependent resolveThumbnailUrl helper, which requires a mock Vault
 * and the mocked TFile class (via the obsidian alias).
 */
import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import { resolveThumbnailUrl } from "../../src/views/thumbnail-helpers";
import type { Vault } from "obsidian";

// ---------------------------------------------------------------------------
// Vault stub factory
// ---------------------------------------------------------------------------

function makeVault(
	resolve: (path: string) => TFile | null = () => null,
	resourcePath = (tf: TFile) => `resource://${tf.path}`,
): Vault {
	return {
		getAbstractFileByPath: vi.fn((p: string) => resolve(p)),
		getResourcePath: vi.fn(resourcePath),
	} as unknown as Vault;
}

// ---------------------------------------------------------------------------
// resolveThumbnailUrl
// ---------------------------------------------------------------------------

describe("resolveThumbnailUrl", () => {
	it("returns http:// URLs unchanged without consulting the vault", () => {
		const vault = makeVault();
		const result = resolveThumbnailUrl("http://example.com/img.png", vault);
		expect(result).toBe("http://example.com/img.png");
		expect((vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});

	it("returns https:// URLs unchanged without consulting the vault", () => {
		const vault = makeVault();
		const result = resolveThumbnailUrl("https://cdn.example.com/pic.jpg", vault);
		expect(result).toBe("https://cdn.example.com/pic.jpg");
		expect((vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
	});

	it("returns getResourcePath result when vault finds the file at the given path", () => {
		const tf = new TFile();
		tf.path = "images/photo.png";
		const vault = makeVault(() => tf);
		const result = resolveThumbnailUrl("images/photo.png", vault);
		expect(result).toBe(`resource://images/photo.png`);
	});

	it("retries with leading slashes stripped when the direct path fails", () => {
		const tf = new TFile();
		tf.path = "attachments/cover.png";
		// First call (with leading slash) fails; second call (stripped) succeeds
		const getAbstract = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(tf);
		const vault = {
			getAbstractFileByPath: getAbstract,
			getResourcePath: vi.fn((f: TFile) => `resource://${f.path}`),
		} as unknown as Vault;
		const result = resolveThumbnailUrl("/attachments/cover.png", vault);
		expect(result).toBe("resource://attachments/cover.png");
		expect(getAbstract).toHaveBeenCalledTimes(2);
	});

	it("returns null when neither the original nor the stripped path resolves", () => {
		const vault = makeVault(() => null);
		const result = resolveThumbnailUrl("missing/file.png", vault);
		expect(result).toBeNull();
	});

	it("returns null when vault returns a non-TFile object for both paths", () => {
		// getAbstractFileByPath might return a TFolder (not TFile) — should yield null
		const notAFile = { path: "folder/" } as unknown as TFile;
		const vault = makeVault(() => notAFile);
		// instanceof TFile will fail for a plain object (not constructed via TFile)
		const result = resolveThumbnailUrl("folder/", vault);
		// notAFile is not an instance of the mock TFile class → null
		expect(result).toBeNull();
	});

	it("strips multiple leading slashes before the retry", () => {
		const tf = new TFile();
		tf.path = "deep/file.png";
		const getAbstract = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(tf);
		const vault = {
			getAbstractFileByPath: getAbstract,
			getResourcePath: vi.fn((f: TFile) => `resource://${f.path}`),
		} as unknown as Vault;
		const result = resolveThumbnailUrl("///deep/file.png", vault);
		expect(result).toBe("resource://deep/file.png");
		// Verify the second call used the stripped path
		expect(getAbstract.mock.calls[1][0]).toBe("deep/file.png");
	});
});
