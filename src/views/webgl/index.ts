export {
  VERTEX_SHADER_SRC,
  FRAGMENT_SHADER_SRC,
  DOT_GRID_VERTEX_SRC,
  DOT_GRID_FRAGMENT_SRC,
  compileShader,
  createProgram,
  buildProgram,
  ShaderCache,
} from "./shaders";

export { BufferPool } from "./buffer-pool";
export type { BufferHandle } from "./buffer-pool";

export { WebGLContainer } from "./WebGLContainer";
export { WebGLGraphics } from "./WebGLGraphics";

export {
  mat3Identity,
  mat3Translate,
  mat3Scale,
  mat3Multiply,
  mat3MultiplyInto,
} from "./mat3";
