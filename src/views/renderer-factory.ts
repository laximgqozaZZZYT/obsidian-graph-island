/**
 * Renderer backend detection and factory functions.
 *
 * For Phase 1 of the WebGL migration, the factory always returns
 * Canvas 2D classes. The WebGL backend will be wired in Step 8
 * once WebGLApp is complete.
 */

import { CanvasApp } from "./canvas2d";
import type { CanvasAppOptions } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";

export type RendererBackend = "canvas2d" | "webgl";

/**
 * Detect whether the current environment supports WebGL2.
 * Returns "webgl" if a WebGL2 context can be created, otherwise "canvas2d".
 */
export function detectBackend(): RendererBackend {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (gl) {
      // Lose the context immediately to free GPU resources
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      return "webgl";
    }
  } catch {
    // WebGL2 not available
  }
  return "canvas2d";
}

/**
 * Create an IApp instance for the given backend.
 *
 * Phase 1: always returns a CanvasApp regardless of the backend parameter.
 * The `backend` parameter is accepted for forward compatibility — once
 * WebGLApp is implemented (Step 8), this function will branch on it.
 */
export function createApp(
  opts: CanvasAppOptions,
  _backend?: RendererBackend,
): IApp {
  // Phase 1: always Canvas 2D (WebGLApp not yet complete)
  return new CanvasApp(opts);
}
