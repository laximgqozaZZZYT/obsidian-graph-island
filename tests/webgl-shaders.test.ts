import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	VERTEX_SHADER_SRC,
	FRAGMENT_SHADER_SRC,
	DOT_GRID_VERTEX_SRC,
	DOT_GRID_FRAGMENT_SRC,
	compileShader,
	createProgram,
	buildProgram,
	ShaderCache,
} from "../src/views/webgl/shaders";
import { BufferPool } from "../src/views/webgl/buffer-pool";

// ---------------------------------------------------------------------------
// Mock WebGL context factory
// ---------------------------------------------------------------------------
function mockGl() {
	let shaderIdCounter = 0;
	let programIdCounter = 0;
	let bufferIdCounter = 0;
	const shaderCompileStatus = new Map<number, boolean>();
	const programLinkStatus = new Map<number, boolean>();

	const gl = {
		VERTEX_SHADER: 0x8b31,
		FRAGMENT_SHADER: 0x8b30,
		COMPILE_STATUS: 0x8b81,
		LINK_STATUS: 0x8b82,

		createShader: vi.fn(() => ++shaderIdCounter),
		shaderSource: vi.fn(),
		compileShader: vi.fn((id: number) => {
			// Default: compilation succeeds
			if (!shaderCompileStatus.has(id)) shaderCompileStatus.set(id, true);
		}),
		getShaderParameter: vi.fn((id: number, pname: number) => {
			if (pname === 0x8b81) return shaderCompileStatus.get(id) ?? true;
			return null;
		}),
		getShaderInfoLog: vi.fn(() => "mock shader error log"),
		deleteShader: vi.fn(),

		createProgram: vi.fn(() => ++programIdCounter),
		attachShader: vi.fn(),
		linkProgram: vi.fn((id: number) => {
			if (!programLinkStatus.has(id)) programLinkStatus.set(id, true);
		}),
		getProgramParameter: vi.fn((id: number, pname: number) => {
			if (pname === 0x8b82) return programLinkStatus.get(id) ?? true;
			return null;
		}),
		getProgramInfoLog: vi.fn(() => "mock link error log"),
		deleteProgram: vi.fn(),

		createBuffer: vi.fn(() => ++bufferIdCounter),
		deleteBuffer: vi.fn(),

		// Helpers for test control
		_failShaderCompile(id: number) {
			shaderCompileStatus.set(id, false);
		},
		_failProgramLink(id: number) {
			programLinkStatus.set(id, false);
		},
	};
	return gl as unknown as WebGL2RenderingContext & typeof gl;
}

// ---------------------------------------------------------------------------
// Shader source constants
// ---------------------------------------------------------------------------
describe("shader source strings", () => {
	it("VERTEX_SHADER_SRC contains a_position attribute", () => {
		expect(VERTEX_SHADER_SRC).toContain("attribute vec2 a_position");
	});

	it("VERTEX_SHADER_SRC contains u_transform uniform", () => {
		expect(VERTEX_SHADER_SRC).toContain("uniform mat3 u_transform");
	});

	it("FRAGMENT_SHADER_SRC sets gl_FragColor", () => {
		expect(FRAGMENT_SHADER_SRC).toContain("gl_FragColor");
	});

	it("DOT_GRID_VERTEX_SRC is a minimal fullscreen quad shader", () => {
		expect(DOT_GRID_VERTEX_SRC).toContain("a_position");
		expect(DOT_GRID_VERTEX_SRC).not.toContain("a_color");
	});

	it("DOT_GRID_FRAGMENT_SRC uses smoothstep for dot rendering", () => {
		expect(DOT_GRID_FRAGMENT_SRC).toContain("smoothstep");
		expect(DOT_GRID_FRAGMENT_SRC).toContain("u_dotRadius");
	});
});

// ---------------------------------------------------------------------------
// compileShader
// ---------------------------------------------------------------------------
describe("compileShader", () => {
	let gl: ReturnType<typeof mockGl>;
	beforeEach(() => {
		gl = mockGl();
	});

	it("returns a shader on success", () => {
		const s = compileShader(gl, gl.VERTEX_SHADER, "void main(){}");
		expect(s).toBeDefined();
		expect(gl.shaderSource).toHaveBeenCalled();
		expect(gl.compileShader).toHaveBeenCalled();
	});

	it("throws with info log on compile failure", () => {
		// The first shader created will have id=1; pre-fail it.
		gl._failShaderCompile(1);
		expect(() => compileShader(gl, gl.VERTEX_SHADER, "bad")).toThrow("Shader compile error: mock shader error log");
		expect(gl.deleteShader).toHaveBeenCalled();
	});

	it("throws when createShader returns null", () => {
		gl.createShader.mockReturnValueOnce(null);
		expect(() => compileShader(gl, gl.VERTEX_SHADER, "x")).toThrow("Failed to create shader");
	});
});

// ---------------------------------------------------------------------------
// createProgram
// ---------------------------------------------------------------------------
describe("createProgram", () => {
	let gl: ReturnType<typeof mockGl>;
	beforeEach(() => {
		gl = mockGl();
	});

	it("returns a program on success", () => {
		const prog = createProgram(gl, 1 as unknown as WebGLShader, 2 as unknown as WebGLShader);
		expect(prog).toBeDefined();
		expect(gl.attachShader).toHaveBeenCalledTimes(2);
		expect(gl.linkProgram).toHaveBeenCalled();
	});

	it("throws with info log on link failure", () => {
		gl._failProgramLink(1);
		expect(() => createProgram(gl, 1 as unknown as WebGLShader, 2 as unknown as WebGLShader)).toThrow(
			"Program link error: mock link error log",
		);
		expect(gl.deleteProgram).toHaveBeenCalled();
	});

	it("throws when createProgram returns null", () => {
		gl.createProgram.mockReturnValueOnce(null);
		expect(() => createProgram(gl, 1 as unknown as WebGLShader, 2 as unknown as WebGLShader)).toThrow(
			"Failed to create WebGL program",
		);
	});
});

// ---------------------------------------------------------------------------
// buildProgram
// ---------------------------------------------------------------------------
describe("buildProgram", () => {
	let gl: ReturnType<typeof mockGl>;
	beforeEach(() => {
		gl = mockGl();
	});

	it("compiles + links and deletes intermediate shaders", () => {
		const prog = buildProgram(gl, "vs source", "fs source");
		expect(prog).toBeDefined();
		// Two shaders compiled, then deleted after linking
		expect(gl.deleteShader).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// ShaderCache
// ---------------------------------------------------------------------------
describe("ShaderCache", () => {
	let gl: ReturnType<typeof mockGl>;
	let cache: ShaderCache;
	beforeEach(() => {
		gl = mockGl();
		cache = new ShaderCache();
	});

	it("returns the same program for identical sources", () => {
		const p1 = cache.get(gl, "vs", "fs");
		const p2 = cache.get(gl, "vs", "fs");
		expect(p1).toBe(p2);
		// buildProgram should only have been called once
		expect(gl.createProgram).toHaveBeenCalledTimes(1);
	});

	it("returns different programs for different sources", () => {
		const p1 = cache.get(gl, "vs1", "fs1");
		const p2 = cache.get(gl, "vs2", "fs2");
		expect(p1).not.toBe(p2);
		expect(gl.createProgram).toHaveBeenCalledTimes(2);
	});

	it("destroy deletes all cached programs", () => {
		cache.get(gl, "vs1", "fs1");
		cache.get(gl, "vs2", "fs2");
		cache.destroy(gl);
		expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
	});

	it("destroy clears the cache so subsequent get recompiles", () => {
		cache.get(gl, "vs", "fs");
		cache.destroy(gl);
		cache.get(gl, "vs", "fs");
		// One from before destroy, one after
		expect(gl.createProgram).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// BufferPool
// ---------------------------------------------------------------------------
describe("BufferPool", () => {
	let gl: ReturnType<typeof mockGl>;
	let pool: BufferPool;
	beforeEach(() => {
		gl = mockGl();
		pool = new BufferPool(gl);
	});

	it("acquire creates a new buffer when pool is empty", () => {
		const h = pool.acquire(64);
		expect(h.vbo).toBeDefined();
		expect(h.data.byteLength).toBeGreaterThanOrEqual(64);
		expect(gl.createBuffer).toHaveBeenCalledTimes(1);
	});

	it("release + acquire reuses the same buffer", () => {
		const h1 = pool.acquire(64);
		pool.release(h1);
		const h2 = pool.acquire(32);
		expect(h2.vbo).toBe(h1.vbo);
		// No new buffer created
		expect(gl.createBuffer).toHaveBeenCalledTimes(1);
	});

	it("acquire skips too-small pooled buffers", () => {
		const small = pool.acquire(16);
		pool.release(small);
		const large = pool.acquire(1024);
		// The small buffer wasn't big enough, so a new one was created
		expect(large.vbo).not.toBe(small.vbo);
		expect(large.data.byteLength).toBeGreaterThanOrEqual(1024);
	});

	it("acquire throws when createBuffer returns null", () => {
		gl.createBuffer.mockReturnValueOnce(null);
		expect(() => pool.acquire(64)).toThrow("Failed to create WebGL buffer");
	});

	it("destroy deletes all pooled GPU buffers", () => {
		const h1 = pool.acquire(32);
		const h2 = pool.acquire(64);
		pool.release(h1);
		pool.release(h2);
		pool.destroy();
		expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
	});

	it("Float32Array has correct element count for requested bytes", () => {
		const h = pool.acquire(100); // 100 bytes = 25 floats
		expect(h.data.length).toBe(25);
		expect(h.data.byteLength).toBe(100);
	});
});
