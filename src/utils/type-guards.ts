/**
 * Type guard utilities — runtime checks paired with TypeScript type predicates.
 *
 * Use these instead of bare `as T` casts where the value crosses a boundary
 * (DOM/event handlers, JSON parsing, frontmatter, dynamic dispatch) so the
 * compiler narrows the type *and* the runtime verifies it.
 *
 * Internal host-pattern casts like `this as unknown as XHost` are intentional
 * and out of scope for these guards.
 */

/** True when `x` is not `null` and not `undefined`. Narrows away both. */
export function isNonNull<T>(x: T | null | undefined): x is T {
	return x !== null && x !== undefined;
}

/** True when `x` is a `string` primitive. */
export function isString(x: unknown): x is string {
	return typeof x === "string";
}

/** True when `x` is a finite `number` (rejects `NaN` and `±Infinity`). */
export function isFiniteNumber(x: unknown): x is number {
	return typeof x === "number" && Number.isFinite(x);
}

/** True when `x` is a `boolean` primitive. */
export function isBoolean(x: unknown): x is boolean {
	return typeof x === "boolean";
}

/**
 * True when `x` is a plain object with string keys (excludes `null` and arrays).
 * Use this before indexing into an `unknown` value.
 */
export function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** True when `x` is an array of unknown items. */
export function isArray(x: unknown): x is unknown[] {
	return Array.isArray(x);
}

/** True when `x` is an `HTMLElement` in the current document. */
export function isHTMLElement(x: unknown): x is HTMLElement {
	return typeof HTMLElement !== "undefined" && x instanceof HTMLElement;
}

/** True when `x` is an `HTMLInputElement` (an `<input>` DOM node). */
export function isHTMLInputElement(x: unknown): x is HTMLInputElement {
	return typeof HTMLInputElement !== "undefined" && x instanceof HTMLInputElement;
}

/** True when `x` is an `HTMLSelectElement` (a `<select>` DOM node). */
export function isHTMLSelectElement(x: unknown): x is HTMLSelectElement {
	return typeof HTMLSelectElement !== "undefined" && x instanceof HTMLSelectElement;
}

/**
 * True when `obj` is a record AND owns a property named `key`.
 * Useful for narrowing optional/dynamic property access from `unknown`.
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
	return isRecord(obj) && key in obj;
}
