// ---------------------------------------------------------------------------
// toast — lightweight notification wrapper (future customization point)
// ---------------------------------------------------------------------------
import { Notice } from "obsidian";

/** Show a brief notification toast. Duration in ms (default 3000). */
export function showToast(message: string, duration = 3000): void {
  new Notice(message, duration);
}
