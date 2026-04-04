/**
 * WebGL-capable graphics object that extends CanvasGraphics.
 *
 * Inherits the Canvas 2D _flush() path for backward compatibility.
 * Adds _flushGL() which tessellates the command queue and renders
 * via WebGL2 using the project's tessellator + shader infrastructure.
 */

import { CanvasGraphics } from "../canvas2d/CanvasGraphics";
import {
	tessellateCircle,
	tessellateRect,
	tessellateRoundedRect,
	tessellateArc,
	flattenBezier,
	flattenQuadratic,
	expandLineStrip,
	dashifyLineStrip,
} from "./tessellator";

// ── Helpers ──────────────────────────────────────────────────────────

/** Number of floats per vertex in the interleaved buffer: x, y, r, g, b, a */
const FLOATS_PER_VERTEX = 6;

/** Extract RGBA float components from a 24-bit hex color. */
function hexToFloats(hex: number): [number, number, number] {
	const r = ((hex >> 16) & 0xff) / 255;
	const g = ((hex >> 8) & 0xff) / 255;
	const b = (hex & 0xff) / 255;
	return [r, g, b];
}

/**
 * Append position-only tessellated vertices into the interleaved buffer
 * with the given color. `posData` contains pairs [x, y, x, y, ...].
 */
function appendColoredVertices(
	target: number[],
	posData: Float32Array,
	r: number,
	g: number,
	b: number,
	a: number,
): void {
	for (let i = 0; i < posData.length; i += 2) {
		target.push(posData[i], posData[i + 1], r, g, b, a);
	}
}

// ── DrawCmd access ──────────────────────────────────────────────────
// CanvasGraphics stores commands in a private field. We use a subclass
// trick: override every mutating method to also push to our own queue,
// then iterate our copy in _flushGL. This avoids touching the parent
// class internals.

/**
 * Mirror of the parent's DrawCmd union — only the variants we need for
 * WebGL tessellation.
 */
type GLDrawCmd =
	| { t: "lineStyle"; width: number; color: number; alpha: number }
	| { t: "beginFill"; color: number; alpha: number }
	| { t: "endFill" }
	| { t: "moveTo"; x: number; y: number }
	| { t: "lineTo"; x: number; y: number }
	| { t: "drawCircle"; x: number; y: number; r: number }
	| { t: "drawRect"; x: number; y: number; w: number; h: number }
	| { t: "quadraticCurveTo"; cx: number; cy: number; x: number; y: number }
	| {
			t: "bezierCurveTo";
			cp1x: number;
			cp1y: number;
			cp2x: number;
			cp2y: number;
			x: number;
			y: number;
	  }
	| { t: "closePath" }
	| {
			t: "arc";
			cx: number;
			cy: number;
			r: number;
			start: number;
			end: number;
			ccw: boolean;
	  }
	| { t: "roundedRect"; x: number; y: number; w: number; h: number; r: number }
	| {
			t: "beginRadialFill";
			cx: number;
			cy: number;
			r: number;
			innerColor: number;
			outerColor: number;
			innerAlpha: number;
			outerAlpha: number;
	  }
	| { t: "setLineDash"; segments: number[] }
	| { t: "setLineCap"; cap: CanvasLineCap }
	| { t: "setLineJoin"; join: CanvasLineJoin };

// ── WebGLGraphics ───────────────────────────────────────────────────

export class WebGLGraphics extends CanvasGraphics {
	/**
	 * Shadow command queue used by _flushGL. Kept in sync with the parent
	 * queue via overridden methods.
	 */
	private glCmds: GLDrawCmd[] = [];

	// -- Override every command method to also push to glCmds -------------

	override clear(): void {
		super.clear();
		this.glCmds.length = 0;
	}

	override lineStyle(
		widthOrObj: number | { width: number; color?: number; alpha?: number; native?: boolean },
		color?: number,
		alpha?: number,
	): void {
		super.lineStyle(widthOrObj, color, alpha);
		if (typeof widthOrObj === "object") {
			this.glCmds.push({
				t: "lineStyle",
				width: widthOrObj.width,
				color: widthOrObj.color ?? 0x000000,
				alpha: widthOrObj.alpha ?? 1,
			});
		} else {
			this.glCmds.push({
				t: "lineStyle",
				width: widthOrObj,
				color: color ?? 0x000000,
				alpha: alpha ?? 1,
			});
		}
	}

	override beginFill(color: number, alpha = 1): void {
		super.beginFill(color, alpha);
		this.glCmds.push({ t: "beginFill", color, alpha });
	}

	override beginRadialFill(
		cx: number,
		cy: number,
		r: number,
		innerColor: number,
		outerColor: number,
		innerAlpha = 1,
		outerAlpha = 1,
	): void {
		super.beginRadialFill(cx, cy, r, innerColor, outerColor, innerAlpha, outerAlpha);
		this.glCmds.push({
			t: "beginRadialFill",
			cx,
			cy,
			r,
			innerColor,
			outerColor,
			innerAlpha,
			outerAlpha,
		});
	}

	override setLineDash(segments: number[]): void {
		super.setLineDash(segments);
		this.glCmds.push({ t: "setLineDash", segments });
	}

	override endFill(): void {
		super.endFill();
		this.glCmds.push({ t: "endFill" });
	}

	override moveTo(x: number, y: number): void {
		super.moveTo(x, y);
		this.glCmds.push({ t: "moveTo", x, y });
	}

	override lineTo(x: number, y: number): void {
		super.lineTo(x, y);
		this.glCmds.push({ t: "lineTo", x, y });
	}

	override drawCircle(x: number, y: number, r: number): void {
		super.drawCircle(x, y, r);
		this.glCmds.push({ t: "drawCircle", x, y, r: Math.max(0, r) });
	}

	override drawRect(x: number, y: number, w: number, h: number): void {
		super.drawRect(x, y, w, h);
		this.glCmds.push({ t: "drawRect", x, y, w, h });
	}

	override quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
		super.quadraticCurveTo(cx, cy, x, y);
		this.glCmds.push({ t: "quadraticCurveTo", cx, cy, x, y });
	}

	override bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
		super.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
		this.glCmds.push({ t: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
	}

	override setLineCap(cap: CanvasLineCap): void {
		super.setLineCap(cap);
		this.glCmds.push({ t: "setLineCap", cap });
	}

	override setLineJoin(join: CanvasLineJoin): void {
		super.setLineJoin(join);
		this.glCmds.push({ t: "setLineJoin", join });
	}

	override closePath(): void {
		super.closePath();
		this.glCmds.push({ t: "closePath" });
	}

	override arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false): void {
		super.arc(cx, cy, r, start, end, ccw);
		this.glCmds.push({ t: "arc", cx, cy, r, start, end, ccw });
	}

	override drawRoundedRect(x: number, y: number, w: number, h: number, r: number): void {
		super.drawRoundedRect(x, y, w, h, r);
		const aw = Math.abs(w);
		const ah = Math.abs(h);
		const ar = Math.max(0, r);
		this.glCmds.push({ t: "roundedRect", x, y, w: aw, h: ah, r: ar });
	}

	override destroy(): void {
		super.destroy();
		this.glCmds.length = 0;
	}

	// -- WebGL rendering path ---------------------------------------------

	/**
	 * Tessellate the accumulated command queue and render via WebGL2.
	 *
	 * @param gl        Active WebGL2 context
	 * @param program   Linked shader program (expects a_position vec2, a_color vec4,
	 *                  u_transform mat3, u_alpha float)
	 * @param transform 3x3 column-major transform matrix (Float32Array[9])
	 * @param parentAlpha  Inherited alpha from parent container
	 */
	/** Tessellate a drawCircle command (fill + optional stroke outline). */
	private _tessellateCircle(
		cmd: { x: number; y: number; r: number },
		addFillShape: (d: Float32Array) => void,
		vertices: number[],
		strokeWidth: number, strokeColor: number, strokeAlpha: number, effAlpha: number,
	): void {
		const segs = cmd.r < 4 ? 12 : cmd.r < 20 ? 24 : 48;
		addFillShape(tessellateCircle(cmd.x, cmd.y, cmd.r, segs));
		if (strokeWidth > 0 && strokeAlpha > 0) {
			const outlinePoints: { x: number; y: number }[] = [];
			const step = (Math.PI * 2) / segs;
			for (let i = 0; i <= segs; i++) {
				const a = i * step;
				outlinePoints.push({ x: cmd.x + cmd.r * Math.cos(a), y: cmd.y + cmd.r * Math.sin(a) });
			}
			const [sr, sg, sb] = hexToFloats(strokeColor);
			appendColoredVertices(vertices, expandLineStrip(outlinePoints, strokeWidth), sr, sg, sb, strokeAlpha * effAlpha);
		}
	}

	/** Tessellate a drawRect command (fill + optional stroke outline). */
	private _tessellateRect(
		cmd: { x: number; y: number; w: number; h: number },
		addFillShape: (d: Float32Array) => void,
		vertices: number[],
		strokeWidth: number, strokeColor: number, strokeAlpha: number, effAlpha: number,
	): void {
		addFillShape(tessellateRect(cmd.x, cmd.y, cmd.w, cmd.h));
		if (strokeWidth > 0 && strokeAlpha > 0) {
			const outline = [
				{ x: cmd.x, y: cmd.y }, { x: cmd.x + cmd.w, y: cmd.y },
				{ x: cmd.x + cmd.w, y: cmd.y + cmd.h }, { x: cmd.x, y: cmd.y + cmd.h },
				{ x: cmd.x, y: cmd.y },
			];
			const [sr, sg, sb] = hexToFloats(strokeColor);
			appendColoredVertices(vertices, expandLineStrip(outline, strokeWidth), sr, sg, sb, strokeAlpha * effAlpha);
		}
	}

	/** Tessellate an arc command and append arc points to pathPoints for stroke. */
	private _tessellateArc(
		cmd: { cx: number; cy: number; r: number; start: number; end: number; ccw: boolean },
		addFillShape: (d: Float32Array) => void,
		pathPoints: { x: number; y: number }[],
	): { lastX: number; lastY: number } {
		addFillShape(tessellateArc(cmd.cx, cmd.cy, cmd.r, cmd.start, cmd.end, cmd.ccw));
		const sweep = cmd.end - cmd.start;
		const arcSegs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
		const arcStep = sweep / arcSegs;
		let lx = 0, ly = 0;
		for (let i = 0; i <= arcSegs; i++) {
			const a = cmd.start + i * arcStep;
			lx = cmd.cx + cmd.r * Math.cos(a);
			ly = cmd.cy + cmd.r * Math.sin(a);
			pathPoints.push({ x: lx, y: ly });
		}
		return { lastX: lx, lastY: ly };
	}

	/** Upload interleaved vertex data and issue a single draw call. */
	private _uploadAndDraw(
		gl: WebGL2RenderingContext, program: WebGLProgram, localTransform: Float32Array,
		effAlpha: number, vertices: number[],
	): void {
		if (vertices.length === 0) return;
		const vertexData = new Float32Array(vertices);
		const vertexCount = vertexData.length / FLOATS_PER_VERTEX;

		gl.useProgram(program);
		const vbo = gl.createBuffer();
		if (!vbo) return;

		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STREAM_DRAW);

		const aPos = gl.getAttribLocation(program, "a_position");
		const aColor = gl.getAttribLocation(program, "a_color");
		const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

		if (aPos >= 0) {
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
		}
		if (aColor >= 0) {
			gl.enableVertexAttribArray(aColor);
			gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
		}

		const uTransform = gl.getUniformLocation(program, "u_transform");
		const uAlpha = gl.getUniformLocation(program, "u_alpha");
		if (uTransform) gl.uniformMatrix3fv(uTransform, false, localTransform);
		if (uAlpha) gl.uniform1f(uAlpha, effAlpha);

		gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

		if (aPos >= 0) gl.disableVertexAttribArray(aPos);
		if (aColor >= 0) gl.disableVertexAttribArray(aColor);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.deleteBuffer(vbo);
	}

	_flushGL(gl: WebGL2RenderingContext, program: WebGLProgram, transform: Float32Array, parentAlpha: number): void {
		if (!this.visible || this.glCmds.length === 0) return;

		const effAlpha = parentAlpha * this.alpha;

		// Build a local transform that incorporates this object's position
		const localTransform = new Float32Array(transform);
		if (this.x !== 0 || this.y !== 0) {
			localTransform[6] += localTransform[0] * this.x + localTransform[3] * this.y;
			localTransform[7] += localTransform[1] * this.x + localTransform[4] * this.y;
		}

		const vertices: number[] = [];

		let fillColor = 0x000000;
		let fillAlpha = 1;
		let strokeWidth = 0;
		let strokeColor = 0x000000;
		let strokeAlpha = 1;
		let hasFill = false;

		let pathPoints: { x: number; y: number }[] = [];
		let lastX = 0;
		let lastY = 0;
		let dashPattern: number[] = [];

		const flushStroke = () => {
			if (strokeWidth > 0 && strokeAlpha > 0 && pathPoints.length >= 2) {
				const [sr, sg, sb] = hexToFloats(strokeColor);
				const sa = strokeAlpha * effAlpha;
				if (dashPattern.length > 0) {
					const segments = dashifyLineStrip(pathPoints, dashPattern);
					for (const seg of segments) {
						appendColoredVertices(vertices, expandLineStrip(seg, strokeWidth), sr, sg, sb, sa);
					}
				} else {
					appendColoredVertices(vertices, expandLineStrip(pathPoints, strokeWidth), sr, sg, sb, sa);
				}
			}
			pathPoints = [];
		};

		const addFillShape = (posData: Float32Array) => {
			if (!hasFill) return;
			const [fr, fg, fb] = hexToFloats(fillColor);
			appendColoredVertices(vertices, posData, fr, fg, fb, fillAlpha * effAlpha);
		};

		for (const cmd of this.glCmds) {
			switch (cmd.t) {
				case "lineStyle":
					flushStroke();
					strokeWidth = cmd.width;
					strokeColor = cmd.color;
					strokeAlpha = cmd.alpha;
					break;

				case "beginFill":
					flushStroke();
					fillColor = cmd.color;
					fillAlpha = cmd.alpha;
					hasFill = true;
					break;

				case "beginRadialFill":
					flushStroke();
					fillColor = cmd.innerColor;
					fillAlpha = cmd.innerAlpha;
					hasFill = true;
					break;

				case "endFill":
					flushStroke();
					hasFill = false;
					break;

				case "moveTo":
					if (pathPoints.length >= 2) flushStroke();
					else pathPoints = [];
					lastX = cmd.x;
					lastY = cmd.y;
					pathPoints.push({ x: cmd.x, y: cmd.y });
					break;

				case "lineTo":
					lastX = cmd.x;
					lastY = cmd.y;
					pathPoints.push({ x: cmd.x, y: cmd.y });
					break;

				case "drawCircle":
					this._tessellateCircle(cmd, addFillShape, vertices, strokeWidth, strokeColor, strokeAlpha, effAlpha);
					break;

				case "drawRect":
					this._tessellateRect(cmd, addFillShape, vertices, strokeWidth, strokeColor, strokeAlpha, effAlpha);
					break;

				case "roundedRect":
					addFillShape(tessellateRoundedRect(cmd.x, cmd.y, cmd.w, cmd.h, cmd.r));
					break;

				case "arc": {
					const pos = this._tessellateArc(cmd, addFillShape, pathPoints);
					lastX = pos.lastX;
					lastY = pos.lastY;
					break;
				}

				case "quadraticCurveTo": {
					const qPoints = flattenQuadratic(lastX, lastY, cmd.cx, cmd.cy, cmd.x, cmd.y);
					for (let i = 1; i < qPoints.length; i++) pathPoints.push(qPoints[i]);
					lastX = cmd.x;
					lastY = cmd.y;
					break;
				}

				case "bezierCurveTo": {
					const bPoints = flattenBezier(lastX, lastY, cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
					for (let i = 1; i < bPoints.length; i++) pathPoints.push(bPoints[i]);
					lastX = cmd.x;
					lastY = cmd.y;
					break;
				}

				case "closePath":
					if (pathPoints.length >= 2) {
						pathPoints.push({ x: pathPoints[0].x, y: pathPoints[0].y });
					}
					break;

				case "setLineDash":
					dashPattern = cmd.segments.length > 0 ? [...cmd.segments] : [];
					break;

				case "setLineCap":
				case "setLineJoin":
					break;
			}
		}

		flushStroke();
		this._uploadAndDraw(gl, program, localTransform, effAlpha, vertices);
	}
}
