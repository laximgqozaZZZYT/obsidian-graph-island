import { describe, it, expect, vi } from "vitest";
import { WebGLContainer } from "../src/views/webgl/WebGLContainer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function mockGl() {
	return {} as unknown as WebGL2RenderingContext;
}

function mockProgram() {
	return {} as unknown as WebGLProgram;
}

function mockOverlayCtx() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

function glChild() {
	return {
		parent: null,
		visible: true,
		_flushGL: vi.fn(),
	};
}

function overlayOnlyChild() {
	return {
		parent: null,
		visible: true,
		_flush: vi.fn(),
	};
}

// ---------------------------------------------------------------------------
// _flushGL — early-exit guards
// ---------------------------------------------------------------------------
describe("WebGLContainer._flushGL — early exits", () => {
	it("does nothing when container is invisible", () => {
		const c = new WebGLContainer();
		c.visible = false;
		const child = glChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, mockOverlayCtx());
		expect(child._flushGL).not.toHaveBeenCalled();
	});

	it("does nothing when alpha is zero", () => {
		const c = new WebGLContainer();
		c.alpha = 0;
		const child = glChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, mockOverlayCtx());
		expect(child._flushGL).not.toHaveBeenCalled();
	});

	it("does nothing when alpha is negative", () => {
		const c = new WebGLContainer();
		c.alpha = -1;
		const child = glChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, mockOverlayCtx());
		expect(child._flushGL).not.toHaveBeenCalled();
	});

	it("does nothing when there are no children", () => {
		const c = new WebGLContainer();
		const ctx = mockOverlayCtx();
		expect(() => c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx)).not.toThrow();
		expect(ctx.save).not.toHaveBeenCalled();
	});

	it("does nothing when every child is invisible", () => {
		const c = new WebGLContainer();
		const child = glChild();
		child.visible = false;
		c.addChild(child as any);
		const ctx = mockOverlayCtx();
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx);
		expect(child._flushGL).not.toHaveBeenCalled();
		expect(ctx.save).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// _flushGL — dispatch to children
// ---------------------------------------------------------------------------
describe("WebGLContainer._flushGL — dispatch", () => {
	it("invokes _flushGL on GL-capable children", () => {
		const c = new WebGLContainer();
		const child = glChild();
		c.addChild(child as any);
		const gl = mockGl();
		const program = mockProgram();
		const ctx = mockOverlayCtx();
		c._flushGL(gl, program, IDENTITY, 1, ctx);
		expect(child._flushGL).toHaveBeenCalledTimes(1);
		const callArgs = (child._flushGL as any).mock.calls[0];
		expect(callArgs[0]).toBe(gl);
		expect(callArgs[1]).toBe(program);
		expect(callArgs[3]).toBe(1); // effAlpha
		expect(callArgs[4]).toBe(ctx);
	});

	it("falls back to _flush(overlayCtx, effAlpha) for non-GL children when an overlay ctx is present", () => {
		const c = new WebGLContainer();
		const child = overlayOnlyChild();
		c.addChild(child as any);
		const ctx = mockOverlayCtx();
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx);
		expect(child._flush).toHaveBeenCalledWith(ctx, 1);
	});

	it("skips non-GL children entirely when overlay ctx is null", () => {
		const c = new WebGLContainer();
		const child = overlayOnlyChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, null);
		expect(child._flush).not.toHaveBeenCalled();
	});

	it("skips invisible children but still renders visible siblings", () => {
		const c = new WebGLContainer();
		const visibleChild = glChild();
		const hiddenChild = glChild();
		hiddenChild.visible = false;
		c.addChild(hiddenChild as any);
		c.addChild(visibleChild as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, mockOverlayCtx());
		expect(hiddenChild._flushGL).not.toHaveBeenCalled();
		expect(visibleChild._flushGL).toHaveBeenCalledTimes(1);
	});

	it("multiplies parentAlpha by this container's alpha for effAlpha", () => {
		const c = new WebGLContainer();
		c.alpha = 0.5;
		const child = glChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 0.4, mockOverlayCtx());
		const effAlpha = (child._flushGL as any).mock.calls[0][3];
		expect(effAlpha).toBeCloseTo(0.2);
	});
});

// ---------------------------------------------------------------------------
// _flushGL — overlay ctx transform stacking
// ---------------------------------------------------------------------------
describe("WebGLContainer._flushGL — overlay ctx transform", () => {
	it("saves, translates by (x, y), and restores the overlay ctx", () => {
		const c = new WebGLContainer();
		c.x = 10;
		c.y = 20;
		c.addChild(glChild() as any);
		const ctx = mockOverlayCtx();
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx);
		expect(ctx.save).toHaveBeenCalledTimes(1);
		expect(ctx.translate).toHaveBeenCalledWith(10, 20);
		expect(ctx.restore).toHaveBeenCalledTimes(1);
	});

	it("scales the overlay ctx when scale is not (1, 1)", () => {
		const c = new WebGLContainer();
		c.scale.x = 2;
		c.scale.y = 3;
		c.addChild(glChild() as any);
		const ctx = mockOverlayCtx();
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx);
		expect(ctx.scale).toHaveBeenCalledWith(2, 3);
	});

	it("does not call ctx.scale when scale is (1, 1)", () => {
		const c = new WebGLContainer();
		c.addChild(glChild() as any);
		const ctx = mockOverlayCtx();
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, ctx);
		expect(ctx.scale).not.toHaveBeenCalled();
	});

	it("skips overlay ctx save/restore entirely when overlayCtx is null", () => {
		const c = new WebGLContainer();
		c.addChild(glChild() as any);
		expect(() => c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, null)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// _flushGL — local transform propagation
// ---------------------------------------------------------------------------
describe("WebGLContainer._flushGL — local transform", () => {
	it("passes a translated+scaled local transform matrix to GL children", () => {
		const c = new WebGLContainer();
		c.x = 5;
		c.y = 7;
		c.scale.x = 2;
		c.scale.y = 4;
		const child = glChild();
		c.addChild(child as any);
		c._flushGL(mockGl(), mockProgram(), IDENTITY, 1, mockOverlayCtx());
		const local = (child._flushGL as any).mock.calls[0][2] as Float32Array;
		// parent(identity) * T(5,7) * S(2,4):
		// scale diag -> [2,0,0, 0,4,0, 5,7,1]
		expect(Array.from(local)).toEqual([2, 0, 0, 0, 4, 0, 5, 7, 1]);
	});

	it("composes with a non-identity parent transform", () => {
		const c = new WebGLContainer();
		c.x = 1;
		c.y = 1;
		const child = glChild();
		c.addChild(child as any);
		// Parent transform: scale by 10 (column-major, diag 10,10,1)
		const parentTransform = new Float32Array([10, 0, 0, 0, 10, 0, 0, 0, 1]);
		c._flushGL(mockGl(), mockProgram(), parentTransform, 1, mockOverlayCtx());
		const local = (child._flushGL as any).mock.calls[0][2] as Float32Array;
		// parent * T(1,1) -> translation scaled by parent's diag (10,10) -> [10,0,0, 0,10,0, 10,10,1]
		// then * S(1,1) (default scale) leaves it unchanged.
		expect(Array.from(local)).toEqual([10, 0, 0, 0, 10, 0, 10, 10, 1]);
	});
});
