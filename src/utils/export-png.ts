// ---------------------------------------------------------------------------
// Export graph view as PNG
// ---------------------------------------------------------------------------
import type { CanvasApp } from "../views/canvas2d";

/**
 * Extract the current Canvas 2D graph view as a PNG Blob.
 *
 * With the Canvas 2D adapter, `app.view` is already an HTMLCanvasElement,
 * so we can convert it directly to a PNG blob without any extraction step.
 *
 * @param app - The CanvasApp instance
 * @returns A Promise resolving to a PNG Blob
 */
export async function exportGraphAsPng(
  app: CanvasApp,
): Promise<Blob> {
  const canvas = app.view;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create PNG blob from canvas"));
        }
      },
      "image/png",
    );
  });
}

/**
 * Trigger a browser download for the given Blob.
 *
 * Creates a temporary anchor element, clicks it, and cleans up the
 * object URL to avoid memory leaks.
 *
 * @param blob - The Blob to download
 * @param filename - The suggested file name
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename for the PNG export.
 * Format: graph-island-YYYY-MM-DD.png
 */
export function makeExportFilename(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `graph-island-${yyyy}-${mm}-${dd}.png`;
}
