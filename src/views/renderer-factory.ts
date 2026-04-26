/**
 * Renderer backend detection and factory functions.
 *
 * Creates the appropriate IApp implementation based on WebGL2 availability.
 * Falls back to Canvas 2D if WebGL2 initialization fails.
 */

import { CanvasApp } from "./canvas2d";
import type { CanvasAppOptions } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";
import { WebGLApp } from "./webgl";

type RendererBackend = "canvas2d" | "webgl";

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
	} catch (_e) {
		// WebGL2 not available
	}
	return "canvas2d";
}

/**
 * Create an IApp instance for the given backend.
 *
 * When `backend` is "webgl" (or auto-detected as such), attempts to create
 * a WebGLApp. Falls back to CanvasApp if WebGL2 initialization fails.
 */
export function createApp(opts: CanvasAppOptions, backend?: RendererBackend): IApp {
	const b = backend ?? detectBackend();
	if (b === "webgl") {
		try {
			return new WebGLApp(opts);
		} catch (_e) {
			// WebGL init failed — fall back to Canvas 2D
			return new CanvasApp(opts);
		}
	}
	return new CanvasApp(opts);
}
