/**
 * panel-types.ts
 *
 * Type helpers and runtime guards shared across panel-* modules. These
 * centralise cast-prone patterns (typed property writes, string→union
 * narrowing for select-dropdown values) so individual section builders
 * can stay free of inline `as` casts.
 *
 * No side effects. No Obsidian API dependencies.
 */
import { ALL_SHAPES, type NodeShape } from "../utils/node-shapes";
import type { PanelState } from "./PanelBuilder";

/** Keys of PanelState whose value type is `boolean` (after stripping
 *  optional-ness). Used to constrain helpers that toggle edge-type flags
 *  and other boolean fields by runtime-known string keys. */
export type PanelBooleanKey = {
	[K in keyof PanelState]-?: PanelState[K] extends boolean ? K : never;
}[keyof PanelState];

/** Typed write helper for boolean fields on PanelState. Replaces ad-hoc
 *  `(panel as unknown as Record<string, unknown>)[key] = v` casts at every
 *  loop call site. The single internal cast is required because TypeScript
 *  cannot resolve the union of literal-typed `K` values back to a single
 *  assignable index — even though `PanelState[K]` reduces to `boolean`
 *  for every `K extends PanelBooleanKey`. */
export function setPanelBool<K extends PanelBooleanKey>(panel: PanelState, key: K, value: boolean): void {
	(panel as Record<K, boolean>)[key] = value;
}

const NODE_SHAPE_VALUES: ReadonlySet<string> = new Set<string>(ALL_SHAPES);
/** Type guard: narrow a free-form string (typically a select-dropdown
 *  value) to NodeShape. */
export function isNodeShape(v: string): v is NodeShape {
	return NODE_SHAPE_VALUES.has(v);
}

type NodeColorMode = NonNullable<PanelState["nodeColorMode"]>;
const NODE_COLOR_MODE_VALUES: ReadonlySet<string> = new Set<string>([
	"default",
	"category",
	"heatmap",
	"community",
	"field",
]);
/** Type guard for the `nodeColorMode` dropdown value. */
export function isNodeColorMode(v: string): v is NodeColorMode {
	return NODE_COLOR_MODE_VALUES.has(v);
}
