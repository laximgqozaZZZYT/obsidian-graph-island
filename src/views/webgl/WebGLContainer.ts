/**
 * WebGL-aware container that extends CanvasContainer.
 *
 * Inherits all scene graph logic (addChild, removeChild, toLocal, toGlobal, _flush)
 * from CanvasContainer. Adds _flushGL() for WebGL rendering with transform stacking.
 *
 * Children that implement _flushGL are rendered via WebGL.
 * Children without _flushGL (e.g. CanvasText) fall back to Canvas 2D overlay.
 */

import { CanvasContainer } from "../canvas2d/CanvasContainer";
import { mat3Multiply } from "./mat3";

// Pre-allocated scratch matrices to avoid per-frame allocations
const _scratchTranslate = new Float32Array(9);
const _scratchScale = new Float32Array(9);
const _scratchLocal = new Float32Array(9);

/**
 * Build a local affine transform from position and scale.
 * Reuses scratch arrays to avoid allocations.
 * Result = parentTransform * translate(x, y) * scale(sx, sy)
 */
function computeLocalTransform(
	parent: Float32Array,
	x: number,
	y: number,
	sx: number,
	sy: number,
	out: Float32Array,
): Float32Array {
	// Build translation matrix in scratch
	_scratchTranslate[0] = 1;
	_scratchTranslate[1] = 0;
	_scratchTranslate[2] = 0;
	_scratchTranslate[3] = 0;
	_scratchTranslate[4] = 1;
	_scratchTranslate[5] = 0;
	_scratchTranslate[6] = x;
	_scratchTranslate[7] = y;
	_scratchTranslate[8] = 1;

	// Build scale matrix in scratch
	_scratchScale[0] = sx;
	_scratchScale[1] = 0;
	_scratchScale[2] = 0;
	_scratchScale[3] = 0;
	_scratchScale[4] = sy;
	_scratchScale[5] = 0;
	_scratchScale[6] = 0;
	_scratchScale[7] = 0;
	_scratchScale[8] = 1;

	// parent * translate
	const pt = mat3Multiply(parent, _scratchTranslate);
	// (parent * translate) * scale → out
	const a0 = pt[0],
		a1 = pt[1],
		a2 = pt[2];
	const a3 = pt[3],
		a4 = pt[4],
		a5 = pt[5];
	const a6 = pt[6],
		a7 = pt[7],
		a8 = pt[8];

	// Multiply by scale (only diagonal elements of scale are non-zero)
	out[0] = a0 * sx;
	out[1] = a1 * sx;
	out[2] = a2 * sx;
	out[3] = a3 * sy;
	out[4] = a4 * sy;
	out[5] = a5 * sy;
	out[6] = a6;
	out[7] = a7;
	out[8] = a8;

	return out;
}

export class WebGLContainer extends CanvasContainer {
	/** Pre-allocated local transform for this container. */
	private _localTransform = new Float32Array(9);

	/**
	 * Render this container and children via WebGL.
	 * Text children fall back to Canvas 2D overlay ctx.
	 */
	_flushGL(
		gl: WebGL2RenderingContext,
		program: WebGLProgram,
		parentTransform: Float32Array,
		parentAlpha: number,
		overlayCtx: CanvasRenderingContext2D | null,
	): void {
		if (!this.visible || this.alpha <= 0) return;

		const children = this.children;
		const len = children.length;
		if (len === 0) return;

		// Quick scan: skip entire subtree if no child is visible
		let anyVisible = false;
		for (let i = 0; i < len; i++) {
			if (children[i].visible) {
				anyVisible = true;
				break;
			}
		}
		if (!anyVisible) return;

		const effAlpha = parentAlpha * this.alpha;

		// Compute local transform: parent * T(x,y) * S(sx,sy)
		const local = computeLocalTransform(
			parentTransform,
			this.x,
			this.y,
			this.scale.x,
			this.scale.y,
			this._localTransform,
		);

		// Apply this container's transform to the overlay context so that
		// any Canvas 2D children (CanvasText labels) at any nesting depth
		// render at the correct world position.
		const hasOverlay = overlayCtx != null;
		if (hasOverlay) {
			overlayCtx!.save();
			overlayCtx!.translate(this.x, this.y);
			if (this.scale.x !== 1 || this.scale.y !== 1) {
				overlayCtx!.scale(this.scale.x, this.scale.y);
			}
		}

		for (let i = 0; i < len; i++) {
			const child = children[i];
			if (!child.visible) continue;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- duck-typed WebGL flush check
			if ("_flushGL" in child && typeof (child as any)._flushGL === "function") {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(child as any)._flushGL(gl, program, local, effAlpha, overlayCtx);
			} else if (hasOverlay) {
				child._flush(overlayCtx!, effAlpha);
			}
		}

		if (hasOverlay) {
			overlayCtx!.restore();
		}
	}
}
