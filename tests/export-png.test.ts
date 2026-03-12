import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportGraphAsPng, downloadBlob, makeExportFilename } from "../src/utils/export-png";

describe("exportGraphAsPng", () => {
  it("calls app.view.toBlob and resolves with a PNG Blob", async () => {
    const fakeCanvas = {
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob(["fake"], { type: "image/png" }));
      }),
    };
    const mockApp = {
      view: fakeCanvas,
    } as any;

    const blob = await exportGraphAsPng(mockApp);

    expect(fakeCanvas.toBlob).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("rejects when toBlob returns null", async () => {
    const fakeCanvas = {
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        cb(null);
      }),
    };
    const mockApp = {
      view: fakeCanvas,
    } as any;

    await expect(exportGraphAsPng(mockApp)).rejects.toThrow(
      "Failed to create PNG blob from canvas",
    );
  });
});

describe("downloadBlob", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download link, and revokes the URL", () => {
    const fakeUrl = "blob:http://localhost/fake-uuid";
    const createObjectURLSpy = vi.fn(() => fakeUrl);
    const revokeObjectURLSpy = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLSpy;
    globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

    const clickSpy = vi.fn();
    const fakeAnchor = { href: "", download: "", click: clickSpy };

    // Mock document in Node environment
    const origDocument = globalThis.document;
    globalThis.document = {
      createElement: vi.fn(() => fakeAnchor),
    } as any;

    try {
      const blob = new Blob(["test"], { type: "image/png" });
      downloadBlob(blob, "test.png");

      expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
      expect(globalThis.document.createElement).toHaveBeenCalledWith("a");
      expect(fakeAnchor.href).toBe(fakeUrl);
      expect(fakeAnchor.download).toBe("test.png");
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(fakeUrl);
    } finally {
      globalThis.document = origDocument;
    }
  });
});

describe("makeExportFilename", () => {
  it("returns a filename in the format graph-island-YYYY-MM-DD.png", () => {
    const filename = makeExportFilename();
    expect(filename).toMatch(/^graph-island-\d{4}-\d{2}-\d{2}\.png$/);
  });

  it("uses the current date", () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const expected = `graph-island-${yyyy}-${mm}-${dd}.png`;
    expect(makeExportFilename()).toBe(expected);
  });
});
