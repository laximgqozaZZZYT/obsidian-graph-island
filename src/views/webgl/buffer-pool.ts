// ---------------------------------------------------------------------------
// BufferPool — reusable WebGL buffer allocation
// ---------------------------------------------------------------------------

export interface BufferHandle {
  vbo: WebGLBuffer;
  data: Float32Array;
}

/**
 * Pool of GPU buffers that can be acquired and released to avoid
 * repeated allocation during per-frame rendering.
 */
export class BufferPool {
  private gl: WebGL2RenderingContext;
  private pool: BufferHandle[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Acquire a buffer with at least `minBytes` capacity. */
  acquire(minBytes: number): BufferHandle {
    // Try to find a pooled buffer that is large enough.
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].data.byteLength >= minBytes) {
        return this.pool.splice(i, 1)[0];
      }
    }

    // No suitable buffer — create a new one.
    const vbo = this.gl.createBuffer();
    if (!vbo) {
      throw new Error("Failed to create WebGL buffer");
    }
    const floatCount = Math.ceil(minBytes / Float32Array.BYTES_PER_ELEMENT);
    const data = new Float32Array(floatCount);
    return { vbo, data };
  }

  /** Return a buffer to the pool for reuse. */
  release(handle: BufferHandle): void {
    this.pool.push(handle);
  }

  /** Delete all GPU buffers. */
  destroy(): void {
    for (const h of this.pool) {
      this.gl.deleteBuffer(h.vbo);
    }
    this.pool.length = 0;
  }
}
