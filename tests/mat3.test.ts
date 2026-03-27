import { describe, it, expect } from "vitest";
import {
  mat3Identity,
  mat3Translate,
  mat3Scale,
  mat3Multiply,
  mat3MultiplyInto,
} from "../src/views/webgl/mat3";

describe("mat3Identity", () => {
  it("returns a 9-element Float32Array with 1s on the diagonal", () => {
    const m = mat3Identity();
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(9);
    // Column-major: [0]=m00, [4]=m11, [8]=m22
    expect(m[0]).toBe(1);
    expect(m[4]).toBe(1);
    expect(m[8]).toBe(1);
    // Off-diagonal should be 0
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
    expect(m[3]).toBe(0);
    expect(m[5]).toBe(0);
    expect(m[6]).toBe(0);
    expect(m[7]).toBe(0);
  });
});

describe("mat3Translate", () => {
  it("places tx,ty in column-major translation slots", () => {
    const m = mat3Translate(10, 20);
    // Column-major: m[6]=tx, m[7]=ty
    expect(m[6]).toBe(10);
    expect(m[7]).toBe(20);
    // Diagonal should be 1
    expect(m[0]).toBe(1);
    expect(m[4]).toBe(1);
    expect(m[8]).toBe(1);
  });

  it("zero translation produces identity", () => {
    const m = mat3Translate(0, 0);
    const id = mat3Identity();
    expect(Array.from(m)).toEqual(Array.from(id));
  });
});

describe("mat3Scale", () => {
  it("places sx,sy on the diagonal", () => {
    const m = mat3Scale(3, 5);
    expect(m[0]).toBe(3);
    expect(m[4]).toBe(5);
    expect(m[8]).toBe(1);
    // Translation slots should be 0
    expect(m[6]).toBe(0);
    expect(m[7]).toBe(0);
  });

  it("unit scale produces identity", () => {
    const m = mat3Scale(1, 1);
    const id = mat3Identity();
    expect(Array.from(m)).toEqual(Array.from(id));
  });
});

describe("mat3Multiply", () => {
  it("identity * A = A", () => {
    const id = mat3Identity();
    const a = mat3Translate(5, 7);
    const result = mat3Multiply(id, a);
    expect(Array.from(result)).toEqual(Array.from(a));
  });

  it("A * identity = A", () => {
    const id = mat3Identity();
    const a = mat3Scale(2, 3);
    const result = mat3Multiply(a, id);
    expect(Array.from(result)).toEqual(Array.from(a));
  });

  it("translate then scale: applies scale to axes, preserves translation", () => {
    // T(10,20) * S(2,3)
    // In column-major:
    // Result should have sx=2, sy=3, tx=10, ty=20
    const t = mat3Translate(10, 20);
    const s = mat3Scale(2, 3);
    const result = mat3Multiply(t, s);
    expect(result[0]).toBe(2);  // sx
    expect(result[4]).toBe(3);  // sy
    expect(result[6]).toBe(10); // tx
    expect(result[7]).toBe(20); // ty
    expect(result[8]).toBe(1);
  });

  it("scale then translate: translation is scaled", () => {
    // S(2,3) * T(10,20)
    // tx = 2*10 = 20, ty = 3*20 = 60
    const s = mat3Scale(2, 3);
    const t = mat3Translate(10, 20);
    const result = mat3Multiply(s, t);
    expect(result[0]).toBe(2);  // sx
    expect(result[4]).toBe(3);  // sy
    expect(result[6]).toBe(20); // tx = sx * tx_orig
    expect(result[7]).toBe(60); // ty = sy * ty_orig
  });

  it("two translations add up", () => {
    const t1 = mat3Translate(3, 4);
    const t2 = mat3Translate(7, 11);
    const result = mat3Multiply(t1, t2);
    expect(result[6]).toBe(10); // 3 + 7
    expect(result[7]).toBe(15); // 4 + 11
  });

  it("two scales multiply", () => {
    const s1 = mat3Scale(2, 3);
    const s2 = mat3Scale(4, 5);
    const result = mat3Multiply(s1, s2);
    expect(result[0]).toBe(8);  // 2 * 4
    expect(result[4]).toBe(15); // 3 * 5
  });

  it("returns a new array (does not mutate inputs)", () => {
    const a = mat3Translate(1, 2);
    const b = mat3Scale(3, 4);
    const aCopy = Float32Array.from(a);
    const bCopy = Float32Array.from(b);
    const result = mat3Multiply(a, b);
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(Array.from(a)).toEqual(Array.from(aCopy));
    expect(Array.from(b)).toEqual(Array.from(bCopy));
  });
});

describe("mat3MultiplyInto", () => {
  it("writes result into target array", () => {
    const target = new Float32Array(9);
    const a = mat3Translate(5, 10);
    const b = mat3Scale(2, 2);
    const returned = mat3MultiplyInto(target, a, b);
    expect(returned).toBe(target);
    expect(target[0]).toBe(2);
    expect(target[6]).toBe(5);
    expect(target[7]).toBe(10);
  });

  it("matches mat3Multiply output", () => {
    const a = mat3Scale(2, 3);
    const b = mat3Translate(7, 11);
    const result1 = mat3Multiply(a, b);
    const target = new Float32Array(9);
    mat3MultiplyInto(target, a, b);
    expect(Array.from(target)).toEqual(Array.from(result1));
  });

  it("in-place safety: target is same array as input a", () => {
    const a = mat3Translate(3, 7);
    const b = mat3Scale(2, 4);
    // Compute expected result with a fresh output
    const expected = mat3Multiply(a, b);
    // Now multiply in-place where target === a
    mat3MultiplyInto(a, a, b);
    expect(Array.from(a)).toEqual(Array.from(expected));
  });

  it("in-place safety: target is same array as input b", () => {
    const a = mat3Scale(5, 3);
    const b = mat3Translate(2, 8);
    const expected = mat3Multiply(a, b);
    mat3MultiplyInto(b, a, b);
    expect(Array.from(b)).toEqual(Array.from(expected));
  });
});

describe("mat3Multiply associativity", () => {
  it("(A*B)*C equals A*(B*C)", () => {
    const A = mat3Translate(3, 7);
    const B = mat3Scale(2, 5);
    const C = mat3Translate(-1, 4);

    const AB = mat3Multiply(A, B);
    const AB_C = mat3Multiply(AB, C);

    const BC = mat3Multiply(B, C);
    const A_BC = mat3Multiply(A, BC);

    // Float32 precision — use closeTo for each element
    for (let i = 0; i < 9; i++) {
      expect(AB_C[i]).toBeCloseTo(A_BC[i], 5);
    }
  });

  it("associativity holds for three translations", () => {
    const A = mat3Translate(1, 2);
    const B = mat3Translate(3, 4);
    const C = mat3Translate(5, 6);

    const AB_C = mat3Multiply(mat3Multiply(A, B), C);
    const A_BC = mat3Multiply(A, mat3Multiply(B, C));

    expect(Array.from(AB_C)).toEqual(Array.from(A_BC));
    // Final translation should be sum: (9, 12)
    expect(AB_C[6]).toBe(9);
    expect(AB_C[7]).toBe(12);
  });

  it("associativity holds for three scales", () => {
    const A = mat3Scale(2, 3);
    const B = mat3Scale(4, 5);
    const C = mat3Scale(6, 7);

    const AB_C = mat3Multiply(mat3Multiply(A, B), C);
    const A_BC = mat3Multiply(A, mat3Multiply(B, C));

    for (let i = 0; i < 9; i++) {
      expect(AB_C[i]).toBeCloseTo(A_BC[i], 5);
    }
    // Diagonal should be product: (48, 105)
    expect(AB_C[0]).toBe(48);
    expect(AB_C[4]).toBe(105);
  });
});
