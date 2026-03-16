# Coordinate Engine System Research

**Date:** 2026-03-15
**Project:** obsidian-graph-island
**Research Focus:** Understanding the coordinate expression system for designing road networks

---

## Overview

The coordinate engine is a generic, expression-based layout system used to position nodes in graph visualizations. It consists of three main components:
1. **Expression evaluator** — safe, type-safe math parser
2. **Coordinate pipeline** — 3-phase data transformation (source → transform → cartesian)
3. **Guide line generation** — renders grid/ring references for axis visualization

This document provides exact file paths, architecture, available functions/constants, and how expressions work.

---

## 1. Expression Evaluator (`src/utils/expr-eval.ts`)

### Functions Available

**Mathematical Functions** (lines 47–61):
| Function | Type | Notes |
|----------|------|-------|
| `sin`, `cos`, `tan` | Trigonometric | Standard Math.* |
| `sqrt` | Square root | |
| `abs` | Absolute value | |
| `log` | Natural logarithm | |
| `exp` | e^x | |
| `floor` | Floor function | Rounds down |
| `ceil` | Ceiling function | Rounds up |
| `min`, `max` | Min/max | Variadic (any arity) |
| `pow(a, b)` | Power | Returns a^b |
| `atan2(y, x)` | Inverse tangent | Two-argument |

### Constants Available

**Built-in Mathematical Constants** (lines 41–45):
| Name | Value | Notes |
|------|-------|-------|
| `pi` | Math.PI | 3.14159... |
| `e` | Math.E | 2.71828... |
| `tau` | 2π | Full circle in radians |

**Built-in Context Variables** (line 63, exposed during evaluation):
| Variable | Type | Meaning |
|----------|------|---------|
| `t` | number | Normalized position in [0, 1] across raw value range |
| `i` | number | Node index (0-indexed within group) |
| `n` | number | Total node count in group |
| `v` | number | Raw axis value before normalization |
| `N` | number | Total node count across all groups (optional) |

**Greek Letter Aliases** (lines 83–89):
Expressions can use Greek letters, which are automatically aliased to Latin letters:
- `π` → `pi`, `τ` → `tau`
- `α` → `a`, `β` → `b`, `γ` → `c`, etc.

### Operators Supported

**Arithmetic** (precedence: additive < multiplicative < power < unary):
- `+` addition
- `-` subtraction / negation
- `*` multiplication (implicit when adjacent: `2x`, `(a)(b)`, `2sin(x)`)
- `/` division (returns 0 if divisor is 0)
- `%` modulo (returns 0 if divisor is 0)
- `^` power (right-associative: `2^3^2 = 2^(3^2) = 512`)

### Expression Parsing

**File:** `src/utils/expr-eval.ts`, lines 113–354

**Parser Type:** Recursive descent (safe, no eval())

**Key Design:**
- Lowercase normalization (all identifiers converted to lowercase, line 151)
- Greek letter resolution happens at tokenizer stage (line 141)
- Implicit multiplication inserted automatically (lines 169–198)
- All invalid/non-finite results clamped to 0 (line 378)

**Example Valid Expressions:**
```
floor(i / _ringSize) + 1          // concentric rings
i * pi * (3 - sqrt(5))            // phyllotaxis
(i % _spokeCount) * (360 / _spokeCount)  // radial angles
sqrt(i)                           // fermat spiral
i - floor((-1+sqrt(1+8*i))/2)...  // triangular packing
```

---

## 2. Coordinate Layout System

### Type Definitions (`src/types.ts`, lines 84–141)

#### AxisSource (line 84–91)

Source of raw numeric values for an axis:

```typescript
type AxisSource =
  | { kind: "index" }                        // 0, 1, 2, ... (node position in group)
  | { kind: "field"; field: string }         // Frontmatter field (e.g., "folder", "tags")
  | { kind: "property"; key: string }        // Node metadata property (e.g., "date", "category")
  | { kind: "metric"; metric: MetricKind }   // Graph metric (degree, in-degree, bfs-depth, sibling-rank)
  | { kind: "hop"; from: string; maxDepth?: number }  // BFS distance from node matching pattern
  | { kind: "random"; seed: number }         // Seeded pseudorandom (deterministic)
  | { kind: "const"; value: number }         // Constant value for all nodes
```

#### AxisTransform (line 111–120)

How raw values map to coordinate space:

```typescript
type AxisTransform =
  | { kind: "linear"; scale: number }        // Raw * scale
  | { kind: "bin"; count: number }           // Quantize into bins with even-width spacing
  | { kind: "date-to-index" }                // Sort dates, assign sequential index
  | { kind: "stack-avoid" }                  // Spread nodes within same-column groups
  | { kind: "golden-angle" }                 // Multiply by golden angle (phyllotaxis)
  | { kind: "even-divide"; totalRange: number }  // Distribute evenly across range (degrees)
  | { kind: "expression"; expr: string; scale?: number }  // Evaluate custom math expression
  | { kind: "curve"; curve: CurveKind; params?: Record<string, number>; scale?: number }  // Parametric curve
  | { kind: "shape-fill"; shape: ShapeFillKind; axis: 1 | 2 }  // Pack into shape (square, triangle, hexagon, etc.)
```

#### AxisConfig (line 123–126)

Full configuration for one axis:

```typescript
interface AxisConfig {
  source: AxisSource;      // Where raw values come from
  transform: AxisTransform; // How to transform them
}
```

#### CoordinateLayout (line 132–141)

Complete layout configuration:

```typescript
interface CoordinateLayout {
  system: CoordinateSystem;  // "cartesian" or "polar"
  axis1: AxisConfig;         // X (cartesian) or r (polar)
  axis2: AxisConfig;         // Y (cartesian) or θ (polar)
  perGroup: boolean;         // Apply per-cluster or globally
  constants?: Record<string, number>;  // User-defined: e.g., { _ringSize: 12, _spokeCount: 8 }
  grid?: GridConfig;         // Optional custom grid configuration
}
```

### Preset Layouts (`src/layouts/coordinate-presets.ts`, lines 106–157)

**File:** `src/layouts/coordinate-presets.ts`

Hardcoded presets that serve as templates:

| Layout | System | Axis1 Expression | Axis2 Expression | Constants |
|--------|--------|------------------|------------------|-----------|
| **concentric** | polar | `floor(i / _ringSize) + 1` | even-divide 360° | `_ringSize: 12` |
| **radial** | polar | `floor(i / _spokeCount) + 1` | `(i % _spokeCount) * (360 / _spokeCount)` | `_spokeCount: 8` |
| **phyllotaxis** | polar | `sqrt(i)` | `i * pi * (3 - sqrt(5))` | (none) |
| **grid** | cartesian | `i % ceil(sqrt(n))` | `floor(i / ceil(sqrt(n)))` | (none) |
| **triangle** | cartesian | Complex triangular formula | Triangular row index | (none) |
| **random** | cartesian | `SOURCE_RANDOM` | `SOURCE_RANDOM` | (none) |
| **timeline** | cartesian | Date property → index | `TRANSFORM_STACK_AVOID` | (none) |
| **custom** | cartesian | Field (folder) | Metric (degree) | (none) |

---

## 3. Coordinate Engine Pipeline (`src/layouts/coordinate-engine.ts`)

**File:** `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/layouts/coordinate-engine.ts`

### Three-Phase Pipeline

#### Phase 1: Resolve Axis Values (lines 400–456)

**Function:** `resolveAxisValues(members, source, ctx): Map<string, number>`

Extracts raw numeric values per node based on source type:

| Source Kind | Resolution Strategy | Example |
|-------------|-------------------|---------|
| `index` | Sequential 0, 1, 2, ... | Fastest, no computation |
| `field` | Get frontmatter field; if numeric, use value; else lexicographic index | "folder" → sorted unique values |
| `property` | Get node.meta[key]; same numeric/lexicographic logic | "date" → sorted ISO dates |
| `metric` | Compute from graph structure (degree, in-degree, out-degree, bfs-depth, sibling-rank) | lines 325–391 |
| `hop` | BFS distance from matching node | lines 223–272 |
| `random` | Seeded hash: seededHash(nodeId, seed) in [0, 1) | lines 1437–1447 |
| `const` | Same value for all nodes | Used for axis constants |

**Missing Value Handling** (lines 125–157):
- Nodes with empty/missing values placed at **end of range** plus gap
- Gap = 15% of data range
- Prevents left-edge clustering artifacts

#### Phase 2: Apply Transform (lines 652–723)

**Function:** `applyTransform(rawValues, transform, spacing, otherAxisValues?, constants?): Map<string, number>`

Maps raw values through coordinate space:

| Transform Kind | Logic | Use Case |
|---|---|---|
| `linear` | raw * scale * spacing | Direct proportional mapping |
| `bin` | Quantize into equal-width bins; bin → (bin + 1) * spacing | Avoid zero-radius in polar layouts |
| `date-to-index` | Sort chronologically, assign sequential index | Timeline arrangements |
| `even-divide` | Distribute evenly across angular range; per-ring variant prevents diagonal stripe (lines 493–509) | Concentric/polar layouts |
| `stack-avoid` | Group by other axis, spread within columns vertically (lines 524–556) | Timeline with vertical stacking |
| `golden-angle` | raw * golden_angle (2.39996..., line 113) | Phyllotaxis/sunflower patterns |
| `curve` | Evaluate registered parametric curve with params | Spiral arrangements |
| `expression` | Parse and evaluate custom math expr with t, i, n, v substitution (lines 593–639) | Custom arrangements |
| `shape-fill` | Pack nodes into shape (square, triangle, hexagon, diamond, circle) (lines 1303–1430) | Geometric packing |

**Key Detail:** Axis2 receives Axis1 transformed values when using `even-divide` or `stack-avoid` (lines 912–916) to coordinate ring-based distributions.

#### Phase 3: Convert to Cartesian (lines 733–772)

**Function:** `toCartesian(axis1Values, axis2Values, system): Map<string, {dx, dy}>`

Converts two axes to (dx, dy) offsets:

**Cartesian System:**
- axis1 → x, axis2 → y
- Direct mapping

**Polar System:**
- axis1 → radius, axis2 → angle (radians)
- Conversion: `dx = r * cos(θ)`, `dy = r * sin(θ)`

**Centroid Normalization** (lines 757–769):
- Computes centroid across all nodes
- Shifts all positions so centroid is at origin
- Ensures neutral layout positioning

### CoordinateContext

**Interface** (lines 50–67):

```typescript
export interface CoordinateContext {
  degrees: Map<string, number>;           // Degree (total connections) per node
  edges: GraphEdge[];                      // All edges in subgraph
  nodeSize: number;                        // Base node radius for spacing
  nodeSpacing: number;                     // Spacing multiplier
  groupScale: number;                      // Group scale multiplier
  getNodeProperty?: (nodeId, key) => string | undefined;  // Property accessor
  coordinateGridDivisions?: number;        // Grid line divisions (default from render thresholds)
  totalNodeCount?: number;                 // Total nodes across all groups (exposed as N)
}
```

**Spacing Formula** (line 889):
```
spacing = nodeSize * 2 * max(nodeSpacing, groupScale)
```

---

## 4. Guide Line Generation

### Types

**CoordinateGuide** (lines 86–96):

```typescript
export interface CoordinateGuide {
  type: "coordinate";
  system: CoordinateSystem;
  axis1Label: string;
  axis2Label: string;
  bounds?: { xMin, yMin, xMax, yMax, maxR? };  // maxR for polar layouts
  gridInfo?: ResolvedGridInfo;
}
```

**ResolvedGridInfo** (lines 76–83):

```typescript
export interface ResolvedGridInfo {
  axis1Lines: ResolvedGridLine[];   // Grid lines for axis 1 with optional labels
  axis2Lines: ResolvedGridLine[];   // Grid lines for axis 2 with optional labels
  axis1Shape: GridShape;            // Shape for rendering axis 1 lines
  axis2Shape: GridShape;            // Shape for rendering axis 2 lines
  style: GridStyle;                 // "lines" or "table"
  cellShading: boolean;             // Table cell background shading
}
```

**ResolvedGridLine** (lines 70–73):

```typescript
export interface ResolvedGridLine {
  position: number;      // Position in transformed coordinate space
  label?: string;        // Optional tick label
}
```

### Grid Rendering in GraphViewContainer.ts

| Function | Location | Renders |
|----------|----------|---------|
| `drawCoordinateGuide` | lines 2581–2651 | Generic coordinate layouts |
| `drawCustomGrid` | lines 2653–2692 | Resolved grid with labels/ticks |
| `drawConcentricGuide` | lines 3080–3100 | Concentric rings plus cross |
| `drawGridLines` | lines 2544–2566 | Grid-style vertical/horizontal lines |

---

## 5. Curve Presets (`src/layouts/coordinate-presets.ts`, lines 14–99)

| Curve | Formula | Default Params | Use Case |
|-------|---------|-----------------|----------|
| **archimedean** | `a + b*t` | {a: 0, b: 1} | Linear spiral |
| **logarithmic** | `a*exp(b*t*tau)` | {a: 1, b: 0.3} | Exponential spiral |
| **fermat** | `a*sqrt(t)` | {a: 1} | Square-root spiral |
| **hyperbolic** | `a/t` (or `a*10` if t=0) | {a: 1} | Hyperbolic spiral |
| **cardioid** | `a*(1 + cos(t*tau))` | {a: 1} | Heart shape |
| **rose** | `a*cos(k*t*tau)` | {k: 3, a: 1} | Flower petals |
| **lissajous** | `sin(a*t*tau + δ)` | {a: 3, b: 2, δ: 0.5} | Harmonic oscillation |
| **golden** | `a*1.618^(t*4)` | {a: 1} | Golden ratio spiral |

---

## 6. Road Network Design Integration

The coordinate engine can support road networks by:

1. **Reusing the expression language** for road positioning
2. **Extending GridShape kinds** for road-specific rendering
3. **Defining road edges separately** from semantic edges
4. **Leveraging grid label system** for road names

**Example Road Patterns:**

- **Grid roads** (cartesian): Vertical `x = i % ceil(sqrt(n))`, Horizontal `y = floor(i / ceil(sqrt(n)))`
- **Ring roads** (polar): `r = floor(i / _ringSize) + 1`, Spokes `θ = (i % _spokeCount) * (360 / _spokeCount)`
- **Spiral highways** (polar): Custom curve expressions

---

## 7. Key Files

| File Path | Purpose | Key Lines |
|-----------|---------|-----------|
| `src/layouts/coordinate-engine.ts` | Expression pipeline | 400–456 (phase 1), 652–723 (phase 2), 733–772 (phase 3) |
| `src/layouts/coordinate-presets.ts` | Preset layouts & curves | 106–157 (layouts), 14–99 (curves) |
| `src/types.ts` | Type definitions | 84–141 (AxisSource, AxisTransform, CoordinateLayout) |
| `src/utils/expr-eval.ts` | Expression parser/evaluator | 47–61 (functions), 41–45 (constants), 113–354 (parser) |
| `src/views/GraphViewContainer.ts` | Grid rendering | 2581–2651 (drawCoordinateGuide), 3080–3100 (drawConcentricGuide) |

