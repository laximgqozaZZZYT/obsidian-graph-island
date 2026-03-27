/**
 * Pure 3x3 affine matrix utilities for WebGL transform stacking.
 *
 * Layout is column-major (WebGL convention):
 *   [ m0  m3  m6 ]
 *   [ m1  m4  m7 ]
 *   [ m2  m5  m8 ]
 *
 * Column-major index mapping:
 *   0=m00  3=m01  6=m02  (tx)
 *   1=m10  4=m11  7=m12  (ty)
 *   2=m20  5=m21  8=m22
 */

/** Create identity 3x3 matrix. */
export function mat3Identity(): Float32Array {
  const out = new Float32Array(9);
  out[0] = 1;
  out[4] = 1;
  out[8] = 1;
  return out;
}

/** Create a 3x3 translation matrix. */
export function mat3Translate(tx: number, ty: number): Float32Array {
  const out = new Float32Array(9);
  out[0] = 1;
  out[4] = 1;
  out[6] = tx;
  out[7] = ty;
  out[8] = 1;
  return out;
}

/** Create a 3x3 scale matrix. */
export function mat3Scale(sx: number, sy: number): Float32Array {
  const out = new Float32Array(9);
  out[0] = sx;
  out[4] = sy;
  out[8] = 1;
  return out;
}

/** Multiply two 3x3 matrices: result = a * b. Returns a new Float32Array. */
export function mat3Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(9);
  return mat3MultiplyInto(out, a, b);
}

/**
 * Multiply in-place: target = a * b, reusing the target array.
 * Column-major 3x3 multiplication.
 */
export function mat3MultiplyInto(
  target: Float32Array,
  a: Float32Array,
  b: Float32Array,
): Float32Array {
  const a0 = a[0], a1 = a[1], a2 = a[2];
  const a3 = a[3], a4 = a[4], a5 = a[5];
  const a6 = a[6], a7 = a[7], a8 = a[8];

  const b0 = b[0], b1 = b[1], b2 = b[2];
  const b3 = b[3], b4 = b[4], b5 = b[5];
  const b6 = b[6], b7 = b[7], b8 = b[8];

  // Column 0
  target[0] = a0 * b0 + a3 * b1 + a6 * b2;
  target[1] = a1 * b0 + a4 * b1 + a7 * b2;
  target[2] = a2 * b0 + a5 * b1 + a8 * b2;

  // Column 1
  target[3] = a0 * b3 + a3 * b4 + a6 * b5;
  target[4] = a1 * b3 + a4 * b4 + a7 * b5;
  target[5] = a2 * b3 + a5 * b4 + a8 * b5;

  // Column 2
  target[6] = a0 * b6 + a3 * b7 + a6 * b8;
  target[7] = a1 * b6 + a4 * b7 + a7 * b8;
  target[8] = a2 * b6 + a5 * b7 + a8 * b8;

  return target;
}
