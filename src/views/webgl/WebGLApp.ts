/**
 * WebGLApp — dual-canvas IApp implementation.
 *
 * Bottom canvas: WebGL2 context for rendering all CanvasGraphics/WebGLGraphics.
 * Top canvas: Canvas 2D context for CanvasText (labels) + overlay callbacks.
 *
 * The `view` property returns the top (overlay) canvas for pointer event binding
 * compatibility with existing consumer code.
 */

import { WebGLContainer } from "./WebGLContainer";
import { WebGLGraphics } from "./WebGLGraphics";
import { CanvasText } from "../canvas2d/CanvasText";
import { CanvasContainer } from "../canvas2d/CanvasContainer";
import {
	buildProgram,
	VERTEX_SHADER_SRC,
	FRAGMENT_SHADER_SRC,
	DOT_GRID_VERTEX_SRC,
	DOT_GRID_FRAGMENT_SRC,
} from "./shaders";
import { hexToRgb, getLuminance } from "../../utils/color";
import type { IApp, ITicker } from "../canvas2d/interfaces";
import type { TextStyle } from "../canvas2d/CanvasText";

// ---------------------------------------------------------------------------
// Ticker (same implementation as CanvasApp)
// ---------------------------------------------------------------------------

type TickerCallback = () => void;

class Ticker implements ITicker {
	private callbacks: { fn: TickerCallback; context: unknown }[] = [];
	private _rafId: number | null = null;
	private _running = false;

	add(fn: TickerCallback, context?: unknown) {
		if (this.callbacks.some((cb) => cb.fn === fn && cb.context === context)) return;
		this.callbacks.push({ fn, context });
		if (!this._running) this._start();
	}

	remove(fn: TickerCallback, context?: unknown) {
		this.callbacks = this.callbacks.filter((cb) => !(cb.fn === fn && cb.context === context));
		if (this.callbacks.length === 0) this._stop();
	}

	private _tick = () => {
		for (const cb of this.callbacks) {
			cb.fn.call(cb.context);
		}
		if (this._running) {
			this._rafId = requestAnimationFrame(this._tick);
		}
	};

	private _start() {
		if (this._running) return;
		this._running = true;
		this._rafId = requestAnimationFrame(this._tick);
	}

	private _stop() {
		this._running = false;
		if (this._rafId !== null) {
			cancelAnimationFrame(this._rafId);
			this._rafId = null;
		}
	}

	destroy() {
		this._stop();
		this.callbacks.length = 0;
	}
}

// ---------------------------------------------------------------------------
// WebGLApp options
// ---------------------------------------------------------------------------

export interface WebGLAppOptions {
	width: number;
	height: number;
	backgroundColor?: number;
	resolution?: number;
}

// ---------------------------------------------------------------------------
// WebGLApp
// ---------------------------------------------------------------------------

export class WebGLApp implements IApp {
	/**
	 * Returns the overlay (top) canvas for pointer event binding compatibility.
	 * Consumer code binds mouse/touch events to `app.view`.
	 */
	readonly view: HTMLCanvasElement;

	/** Root scene graph container. */
	readonly stage: WebGLContainer;

	/** Animation ticker — fires _render each frame. */
	readonly ticker: Ticker;

	/** Logical dimensions (CSS pixels, before DPR scaling). */
	readonly renderer: { width: number; height: number };

	/** Whether to show the background dot grid. */
	showDotGrid = true;

	/** WebGL backend supports GPU-accelerated animations */
	readonly supportsAnimation = true;

	/** Called before scene graph flush, receives overlay Canvas 2D ctx. */
	onPreFlush: ((ctx: CanvasRenderingContext2D, dpr: number) => void) | null = null;

	/** Called after scene graph flush, receives overlay Canvas 2D ctx. */
	onPostFlush: ((ctx: CanvasRenderingContext2D, dpr: number) => void) | null = null;

	/** Wrapper div containing both canvases. */
	readonly wrapperEl: HTMLDivElement;

	/** For dual-canvas backend the view container is the wrapper div. */
	get viewContainer(): HTMLElement {
		return this.wrapperEl;
	}

	// -- Private state -------------------------------------------------------

	private _glCanvas: HTMLCanvasElement;
	private _gl: WebGL2RenderingContext;
	private _overlayCtx: CanvasRenderingContext2D;
	private _resolution: number;
	private _bgColor: number;

	// Shader programs
	private _program: WebGLProgram;
	private _dotGridProgram: WebGLProgram | null = null;
	private _dotGridVAO: WebGLVertexArrayObject | null = null;
	private _dotGridVBO: WebGLBuffer | null = null;

	// Uniform locations (main program)
	private _uTransform: WebGLUniformLocation | null;

	// Dirty flag
	private _needsRender = true;

	constructor(opts: WebGLAppOptions) {
		this._resolution = opts.resolution ?? (window.devicePixelRatio || 1);
		this._bgColor = opts.backgroundColor ?? 0x000000;

		const dpr = this._resolution;
		const w = opts.width;
		const h = opts.height;

		// -- Create wrapper div ------------------------------------------------
		this.wrapperEl = document.createElement("div");
		this.wrapperEl.className = "gi-renderer-wrapper";
		this.wrapperEl.style.position = "relative";
		this.wrapperEl.style.width = `${w}px`;
		this.wrapperEl.style.height = `${h}px`;

		// -- Create WebGL canvas (bottom) --------------------------------------
		this._glCanvas = document.createElement("canvas");
		this._glCanvas.className = "gi-gl-canvas";
		this._glCanvas.style.position = "absolute";
		this._glCanvas.style.top = "0";
		this._glCanvas.style.left = "0";
		this._glCanvas.width = w * dpr;
		this._glCanvas.height = h * dpr;
		this._glCanvas.style.width = `${w}px`;
		this._glCanvas.style.height = `${h}px`;

		// -- Create overlay Canvas 2D canvas (top, transparent) ----------------
		const overlayCanvas = document.createElement("canvas");
		overlayCanvas.className = "gi-overlay-canvas";
		overlayCanvas.style.position = "absolute";
		overlayCanvas.style.top = "0";
		overlayCanvas.style.left = "0";
		overlayCanvas.width = w * dpr;
		overlayCanvas.height = h * dpr;
		overlayCanvas.style.width = `${w}px`;
		overlayCanvas.style.height = `${h}px`;

		this.wrapperEl.appendChild(this._glCanvas);
		this.wrapperEl.appendChild(overlayCanvas);

		// `view` is the overlay canvas — pointer events bind here
		this.view = overlayCanvas;

		// -- Get contexts ------------------------------------------------------
		const gl = this._glCanvas.getContext("webgl2", {
			alpha: false,
			antialias: true,
			preserveDrawingBuffer: false,
		});
		if (!gl) {
			throw new Error("WebGL2 context creation failed");
		}
		this._gl = gl;

		const ctx = overlayCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("2D overlay context creation failed");
		}
		this._overlayCtx = ctx;

		// -- Build main shader program -----------------------------------------
		this._program = buildProgram(gl, VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC);
		this._uTransform = gl.getUniformLocation(this._program, "u_transform");

		// -- Scene graph + ticker ----------------------------------------------
		this.stage = new WebGLContainer();
		this.ticker = new Ticker();
		this.renderer = { width: w, height: h };

		this.ticker.add(this._render, this);
	}

	// -- IApp methods --------------------------------------------------------

	markNeedsRender(): void {
		this._needsRender = true;
	}

	setBackgroundColor(color: number): void {
		this._bgColor = color;
		this._needsRender = true;
	}

	resize(width: number, height: number): void {
		const dpr = this._resolution;

		// Update logical size
		this.renderer.width = width;
		this.renderer.height = height;

		// Resize WebGL canvas
		this._glCanvas.width = width * dpr;
		this._glCanvas.height = height * dpr;
		this._glCanvas.style.width = `${width}px`;
		this._glCanvas.style.height = `${height}px`;

		// Resize overlay canvas
		this.view.width = width * dpr;
		this.view.height = height * dpr;
		this.view.style.width = `${width}px`;
		this.view.style.height = `${height}px`;

		// Resize wrapper
		this.wrapperEl.style.width = `${width}px`;
		this.wrapperEl.style.height = `${height}px`;

		this._needsRender = true;
	}

	/**
	 * Returns the overlay Canvas 2D context for backward compatibility.
	 * Consumer code that needs a CanvasRenderingContext2D (e.g. for hit testing)
	 * can call this.
	 */
	getContext(): CanvasRenderingContext2D {
		return this._overlayCtx;
	}

	destroy(): void {
		this.ticker.destroy();
		this.stage.destroy();

		const gl = this._gl;

		// Clean up shader programs
		gl.deleteProgram(this._program);
		if (this._dotGridProgram) gl.deleteProgram(this._dotGridProgram);
		if (this._dotGridVBO) gl.deleteBuffer(this._dotGridVBO);
		if (this._dotGridVAO) gl.deleteVertexArray(this._dotGridVAO);

		// Lose context to free GPU resources
		const ext = gl.getExtension("WEBGL_lose_context");
		if (ext) ext.loseContext();
	}

	// -- Factory methods -----------------------------------------------------

	createGraphics(): WebGLGraphics {
		return new WebGLGraphics();
	}

	createContainer(): WebGLContainer {
		return new WebGLContainer();
	}

	createText(text: string, style: TextStyle): CanvasText {
		return new CanvasText(text, style);
	}

	// -- Render loop ---------------------------------------------------------

	private _render(): void {
		if (!this._needsRender) return;
		this._needsRender = false;

		const gl = this._gl;
		const ctx = this._overlayCtx;
		const dpr = this._resolution;
		const cw = gl.canvas.width;
		const ch = gl.canvas.height;

		// 1. Clear WebGL canvas
		gl.viewport(0, 0, cw, ch);
		const { r: bgR, g: bgG, b: bgB } = hexToRgb(this._bgColor);
		gl.clearColor(bgR / 255, bgG / 255, bgB / 255, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// 2. Draw dot grid on WebGL canvas (optional)
		if (this.showDotGrid) {
			this._drawDotGrid();
		}

		// 3. Clear overlay canvas
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		// 4. Set up overlay ctx scaling for DPR
		ctx.save();
		ctx.scale(dpr, dpr);

		// 5. Pre-flush callback (overlay ctx)
		if (this.onPreFlush) this.onPreFlush(ctx, dpr);

		// 6. Flush scene graph
		//    Build projection matrix: world coords -> WebGL clip space
		const projMatrix = this._buildProjectionMatrix();
		gl.useProgram(this._program);
		if (this._uTransform) {
			gl.uniformMatrix3fv(this._uTransform, false, projMatrix);
		}

		// Set global alpha to 1.0 (base level)
		const uAlpha = gl.getUniformLocation(this._program, "u_alpha");
		if (uAlpha) gl.uniform1f(uAlpha, 1);

		// Traverse stage — GL children go to _flushGL, text to overlay _flush
		this.stage._flushGL(gl, this._program, projMatrix, 1, ctx);

		// 7. Post-flush callback (overlay ctx)
		if (this.onPostFlush) this.onPostFlush(ctx, dpr);

		ctx.restore();
	}

	/**
	 * Build the projection matrix that maps canvas pixel coordinates
	 * to WebGL clip space (-1 to 1).
	 *
	 * sx =  2 / canvasWidth   (scale X)
	 * sy = -2 / canvasHeight  (scale Y, flipped — WebGL Y is up, Canvas Y is down)
	 * tx = -1                 (translate X)
	 * ty =  1                 (translate Y)
	 *
	 * Column-major 3x3:
	 *   [ sx   0   tx ]
	 *   [  0  sy   ty ]
	 *   [  0   0    1 ]
	 */
	private _buildProjectionMatrix(): Float32Array {
		const cw = this._glCanvas.width;
		const ch = this._glCanvas.height;
		const dpr = this._resolution;

		const out = new Float32Array(9);
		// Apply DPR scaling in the projection so world coordinates are in CSS pixels
		out[0] = (2 * dpr) / cw; // sx
		out[1] = 0;
		out[2] = 0;
		out[3] = 0;
		out[4] = (-2 * dpr) / ch; // sy (flip Y)
		out[5] = 0;
		out[6] = -1; // tx
		out[7] = 1; // ty
		out[8] = 1;
		return out;
	}

	// -- Dot grid (WebGL) ----------------------------------------------------

	/**
	 * Draw the background dot grid using the dedicated dot grid shader.
	 * Renders a fullscreen quad and computes dots procedurally in the
	 * fragment shader.
	 */
	private _drawDotGrid(): void {
		const gl = this._gl;

		// Get world transform from stage's first child (the world container)
		const world = this.stage.children[0];
		if (!world || !(world instanceof CanvasContainer)) return;

		const dpr = this._resolution;
		const wx = world.x * dpr;
		const wy = world.y * dpr;
		const ws = (world.scale?.x ?? 1) * dpr;

		const spacing = 30; // world-units between dots
		const screenSpacing = spacing * ws;
		if (screenSpacing < 4) return; // Too zoomed out

		// Lazily build dot grid shader program
		if (!this._dotGridProgram) {
			this._dotGridProgram = buildProgram(gl, DOT_GRID_VERTEX_SRC, DOT_GRID_FRAGMENT_SRC);
		}

		// Lazily create fullscreen quad VAO/VBO
		if (!this._dotGridVAO) {
			this._dotGridVAO = gl.createVertexArray();
			this._dotGridVBO = gl.createBuffer();
			if (this._dotGridVAO && this._dotGridVBO) {
				gl.bindVertexArray(this._dotGridVAO);
				gl.bindBuffer(gl.ARRAY_BUFFER, this._dotGridVBO);
				// Fullscreen quad (two triangles in clip space)
				const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
				gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
				const aPos = gl.getAttribLocation(this._dotGridProgram, "a_position");
				if (aPos >= 0) {
					gl.enableVertexAttribArray(aPos);
					gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
				}
				gl.bindVertexArray(null);
			}
		}

		const prog = this._dotGridProgram;
		gl.useProgram(prog);

		// Set uniforms
		const cw = gl.canvas.width;
		const ch = gl.canvas.height;

		const uResolution = gl.getUniformLocation(prog, "u_resolution");
		const uOffset = gl.getUniformLocation(prog, "u_offset");
		const uScale = gl.getUniformLocation(prog, "u_scale");
		const uSpacing = gl.getUniformLocation(prog, "u_spacing");
		const uDotColor = gl.getUniformLocation(prog, "u_dotColor");
		const uDotRadius = gl.getUniformLocation(prog, "u_dotRadius");

		if (uResolution) gl.uniform2f(uResolution, cw, ch);
		if (uOffset) gl.uniform2f(uOffset, wx, wy);
		if (uScale) gl.uniform1f(uScale, ws);
		if (uSpacing) gl.uniform1f(uSpacing, spacing);

		// Theme-aware dot color
		const { r, g, b } = hexToRgb(this._bgColor);
		const brightness = getLuminance(r, g, b);
		const dotAlpha = brightness > 128 ? 0.08 : 0.12;
		const dotR = brightness > 128 ? 0 : 1;
		const dotG = brightness > 128 ? 0 : 1;
		const dotB = brightness > 128 ? 0 : 1;

		if (uDotColor) gl.uniform4f(uDotColor, dotR, dotG, dotB, dotAlpha);
		if (uDotRadius) gl.uniform1f(uDotRadius, Math.max(0.5, (ws * 0.8) / dpr));

		// Draw fullscreen quad
		if (this._dotGridVAO) {
			gl.bindVertexArray(this._dotGridVAO);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindVertexArray(null);
		}

		// Restore main program
		gl.useProgram(this._program);
	}
}
