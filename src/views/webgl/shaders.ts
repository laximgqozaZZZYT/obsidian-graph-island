// ---------------------------------------------------------------------------
// WebGL shader sources and compilation utilities
// ---------------------------------------------------------------------------

// ---- Vertex shader: position + per-vertex color ----
export const VERTEX_SHADER_SRC = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform mat3 u_transform;
uniform float u_alpha;
varying vec4 v_color;

void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.x, pos.y, 0.0, 1.0);
  v_color = a_color * vec4(1.0, 1.0, 1.0, u_alpha);
}
`;

// ---- Fragment shader: simple color passthrough ----
export const FRAGMENT_SHADER_SRC = `
precision mediump float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

// ---- Dot grid vertex: fullscreen quad ----
export const DOT_GRID_VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// ---- Dot grid fragment: procedural dot pattern ----
export const DOT_GRID_FRAGMENT_SRC = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform float u_scale;
uniform float u_spacing;
uniform vec4 u_dotColor;
uniform float u_dotRadius;

void main() {
  vec2 worldPos = (gl_FragCoord.xy - u_offset) / u_scale;
  vec2 gridPos = mod(worldPos, u_spacing);
  float dist = length(gridPos - u_spacing * 0.5);
  float alpha = 1.0 - smoothstep(u_dotRadius - 0.5, u_dotRadius + 0.5, dist);
  gl_FragColor = u_dotColor * vec4(1.0, 1.0, 1.0, alpha);
}
`;

// ---------------------------------------------------------------------------
// Compilation utilities
// ---------------------------------------------------------------------------

/** Compile a single shader from source. Throws on compilation error. */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Failed to create shader (type=${type})`);
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

/** Link vertex + fragment shaders into a program. Throws on link error. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create WebGL program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "(no log)";
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

/** Compile + link a shader program from source strings. */
export function buildProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  try {
    return createProgram(gl, vs, fs);
  } finally {
    // Shaders can be detached after linking; delete to free GPU memory.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
}

// ---------------------------------------------------------------------------
// ShaderCache — deduplicates compiled programs by source content
// ---------------------------------------------------------------------------

/** Simple string hash for cache keys. */
function hashSources(vsSrc: string, fsSrc: string): string {
  // Use a fast numeric hash; collisions are harmless (just a cache miss).
  let h = 0;
  const combined = vsSrc + "\0" + fsSrc;
  for (let i = 0; i < combined.length; i++) {
    h = (Math.imul(31, h) + combined.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export class ShaderCache {
  private cache = new Map<string, WebGLProgram>();

  /** Return a cached program or compile + cache a new one. */
  get(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
    const key = hashSources(vsSrc, fsSrc);
    let prog = this.cache.get(key);
    if (!prog) {
      prog = buildProgram(gl, vsSrc, fsSrc);
      this.cache.set(key, prog);
    }
    return prog;
  }

  /** Delete all cached programs from GPU. */
  destroy(gl: WebGL2RenderingContext): void {
    for (const prog of this.cache.values()) {
      gl.deleteProgram(prog);
    }
    this.cache.clear();
  }
}
