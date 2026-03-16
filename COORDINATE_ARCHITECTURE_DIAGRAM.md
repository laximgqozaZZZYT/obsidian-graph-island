# Coordinate Engine Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Coordinate Engine Pipeline                    │
└─────────────────────────────────────────────────────────────────┘

INPUT: GraphNode[] members (nodes to layout)
       CoordinateLayout config (axis sources, transforms, system)
       CoordinateContext ctx (metadata, metrics)

        ┌──────────────────────────────────────────────────┐
        │ Phase 1: Resolve Axis Values                     │
        │ extractAxisValues(members, source)               │
        │                                                  │
        │ source.kind ∈ {index, field, property, metric,  │
        │                hop, random, const}              │
        │                                                  │
        │ Output: axis1Values, axis2Values                │
        │         (Map<nodeId, number>)                   │
        └──────────────────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────────────────┐
        │ Phase 2: Apply Transform                         │
        │ applyTransform(rawValues, transform, spacing)    │
        │                                                  │
        │ transform.kind ∈ {linear, bin,                  │
        │                  date-to-index, stack-avoid,    │
        │                  golden-angle, even-divide,     │
        │                  expression, curve,              │
        │                  shape-fill}                     │
        │                                                  │
        │ Output: t1Values, t2Values                       │
        │         (Map<nodeId, number>)                   │
        └──────────────────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────────────────┐
        │ Phase 3: Convert to Cartesian                    │
        │ toCartesian(t1Values, t2Values, system)          │
        │                                                  │
        │ If system = "cartesian":                         │
        │   (x, y) = (t1, t2)                             │
        │                                                  │
        │ If system = "polar":                             │
        │   (x, y) = (r*cos(θ), r*sin(θ))                │
        │            where r=t1, θ=t2                     │
        │                                                  │
        │ Centroid normalize: shift all by centroid        │
        │                                                  │
        │ Output: offsets                                  │
        │         (Map<nodeId, {dx, dy}>)                │
        └──────────────────────────────────────────────────┘
                            ↓
                      ArrangementResult
                      { offsets, guide? }

OUTPUT: Node positions (dx, dy) relative to group center
        Guide visualization data (grid lines, rings, etc.)
```

---

## Expression Evaluation Context

```
┌─────────────────────────────────────────────────────────────────┐
│              Expression Evaluator (src/utils/expr-eval.ts)       │
└─────────────────────────────────────────────────────────────────┘

FUNCTIONS:
  sin(x), cos(x), tan(x)     — trigonometry
  sqrt(x)                     — square root
  abs(x), floor(x), ceil(x)  — rounding
  log(x), exp(x)             — logarithmic/exponential
  min(...), max(...)         — variadic min/max
  pow(a, b), atan2(y, x)     — power, arctangent

CONSTANTS:
  pi    = 3.14159...
  e     = 2.71828...
  tau   = 6.28318...  (2π)

VARIABLES (substituted during evaluation):
  t     — normalized value ∈ [0, 1]
  i     — node index ∈ [0, n-1]
  n     — total nodes in group
  v     — raw axis value (before normalization)
  N     — total nodes across all groups (optional)
  
  + user-defined constants from CoordinateLayout.constants

OPERATORS:
  +, -, *, /, %, ^ (power)
  Implicit multiplication: 2x → 2*x, (a)(b) → a*b

PARSER:
  Recursive descent, case-insensitive
  Greek letters aliased: π → pi, θ → t, etc.
  No eval(), no security vulnerabilities
  Invalid/non-finite results clamped to 0
```

---

## Axis Source Resolution

```
┌──────────────────────────────────────────────────────────────┐
│              AxisSource Kinds & Resolution                   │
└──────────────────────────────────────────────────────────────┘

KIND: "index"
  → 0, 1, 2, ..., n-1
  → Fastest; no computation

KIND: "field" | "property"
  → Get frontmatter field or node.meta[key]
  → If numeric: use values as-is
  → If non-numeric: sort unique values, assign indices
  → Missing values → placed at range_end + 15% gap

KIND: "metric"
  Metrics: degree, in-degree, out-degree, bfs-depth, sibling-rank
  → Computed from graph structure
  → E.g., degree = node.edges.count

KIND: "hop"
  → BFS distance from node matching pattern
  → fromPattern = substring match on node ID
  → maxDepth = limit search radius

KIND: "random"
  → Deterministic seeded hash
  → seed parameter controls reproducibility
  → Returns values ∈ [0, 1)

KIND: "const"
  → Same value for all nodes
  → Useful for fixed-value axes
```

---

## Transform Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│              AxisTransform Kinds                             │
└──────────────────────────────────────────────────────────────┘

"linear"
  value → raw * scale * spacing

"bin"
  Quantize into count bins of equal width
  bin ∈ [0, count-1] → (bin + 1) * spacing
  (Avoids zero-radius in polar layouts)

"date-to-index"
  Sort nodes chronologically
  Assign sequential index

"even-divide"
  Distribute across totalRange degrees (angular)
  Per-ring variant: group by other-axis value
    → prevents diagonal-stripe artifacts
  Per-node: i / (maxVal + 1) * totalRange

"stack-avoid"
  Group nodes by other-axis bin
  Within each bin: spread vertically
  Prevents node stacking in timeline layouts

"golden-angle"
  value → value * GOLDEN_ANGLE
  GOLDEN_ANGLE = 2.39996... (used in phyllotaxis)

"expression"
  Custom math expression using t, i, n, v
  Parsed & evaluated per-node
  Example: "floor(i / _ringSize) + 1"

"curve"
  Parametric curve (archimedean, logarithmic, fermat, rose, etc.)
  Normalized t ∈ [0, 1] → curve_value
  Apply params override & scale

"shape-fill"
  Pack nodes into geometric shape
  Shapes: square, triangle, hexagon, diamond, circle
  axis ∈ {1, 2} specifies which coordinate gets the shape
```

---

## Preset Layouts

```
┌──────────────────────────────────────────────────────────────┐
│              Arrangement Presets                             │
└──────────────────────────────────────────────────────────────┘

CONCENTRIC (polar)
  axis1: floor(i / _ringSize) + 1       → rings 1, 2, 3, ...
  axis2: even-divide(360°)               → angles distributed per ring
  _ringSize = 12 (configurable)
  
  Visual: circles around origin

RADIAL (polar)
  axis1: floor(i / _spokeCount) + 1      → rings
  axis2: (i % _spokeCount) * 360/spokes  → equidistant angles per ring
  _spokeCount = 8 (configurable)
  
  Visual: spokes radiating from origin

PHYLLOTAXIS (polar)
  axis1: sqrt(i)                         → golden-spiral radius
  axis2: i * pi * (3 - sqrt(5))          → golden-angle rotations
  
  Visual: Fibonacci/sunflower pattern

GRID (cartesian)
  axis1: i % ceil(sqrt(n))              → column index
  axis2: floor(i / ceil(sqrt(n)))       → row index
  
  Visual: square grid

TRIANGLE (cartesian)
  axis1: column within row               → complex formula
  axis2: row index                       → triangular packing
  
  Visual: equilateral triangle

RANDOM (cartesian)
  axis1: seeded_hash(nodeId, seed)      → random x
  axis2: seeded_hash(nodeId, seed)      → random y
  
  Visual: scattered noise

TIMELINE (cartesian)
  axis1: node.meta.date → index          → x = time axis
  axis2: stack-avoid(spacing)            → y = vertical spread
  
  Visual: timeline with collision avoidance

CUSTOM (cartesian)
  axis1: any field/metric                → x axis (user-defined)
  axis2: any metric                      → y axis (user-defined)
  
  Visual: custom scatterplot
```

---

## Grid Line Generation

```
┌──────────────────────────────────────────────────────────────┐
│         Guide Line Rendering (GraphViewContainer.ts)         │
└──────────────────────────────────────────────────────────────┘

CONCENTRIC GUIDE (drawConcentricGuide, line 3080):
  For each ring radius in guide.rings:
    drawCircle(cx, cy, r)  [line style: 0.8 width, 0.3 alpha]
  
  Center cross (maxR span):
    horizontal & vertical lines [0.5 width, 0.15 alpha]
  
  Visual: concentric rings + crosshair

GRID GUIDE (drawGridLines, line 2544):
  Vertical lines at guide.verticals positions
  Horizontal lines at guide.horizontals positions
  Lines span bounds [xMin, yMin, xMax, yMax]
  
  Visual: rectangular grid

COORDINATE GUIDE - CARTESIAN (drawCoordinateGuide, line 2581):
  Default: 4 divisions per axis
    Vertical lines: cx + xMin + (xRange/4)*i
    Horizontal lines: cy + yMin + (yRange/4)*i
    Origin cross: stronger highlighting
  
  Style: 0.8 width, 0.15 alpha for grid lines
          1.0 width, 0.25 alpha for origin

COORDINATE GUIDE - POLAR (drawCoordinateGuide, line 2605):
  Rings (circles):
    For i = 1..ringCount:
      drawCircle(cx, cy, (maxR/ringCount)*i)
    Style: 0.8 width, 0.15 alpha
  
  Spokes (radial lines):
    6 directions (60° apart)
    Each: line from (cx, cy) to (cx + maxR*cos(θ), cy + maxR*sin(θ))
    Style: 0.5 width, 0.1 alpha

CUSTOM GRID (drawCustomGrid, line 2653):
  Uses ResolvedGridInfo from CoordinateGuide
  For each axis1Line:
    drawGridLine(..axis1Line, axis1Shape..)  [e.g., "circle"]
  For each axis2Line:
    drawGridLine(..axis2Line, axis2Shape..)  [e.g., "radial"]
  
  Shapes:
    "line"   → straight line (cartesian)
    "circle" → concentric circles (polar)
    "radial" → spoke from origin (polar)
    "curve"  → parametric curve (custom)
  
  Styling:
    gridLineAlpha = 0.15 (configurable)
    cellShading = optional table background
```

---

## Data Structures

```
┌──────────────────────────────────────────────────────────────┐
│              Key Type Definitions                            │
└──────────────────────────────────────────────────────────────┘

CoordinateLayout:
  {
    system: "cartesian" | "polar"
    axis1: AxisConfig { source: AxisSource, transform: AxisTransform }
    axis2: AxisConfig { source: AxisSource, transform: AxisTransform }
    perGroup: boolean
    constants?: { _ringSize: 12, _spokeCount: 8, ...custom }
    grid?: GridConfig
  }

CoordinateGuide (output from coordinateOffsets):
  {
    type: "coordinate"
    system: "cartesian" | "polar"
    axis1Label: string  (e.g., "index", "folder", "degree")
    axis2Label: string
    bounds?: { xMin, yMin, xMax, yMax, maxR? }
    gridInfo?: {
      axis1Lines: [{ position: number, label?: string }, ...]
      axis2Lines: [{ position: number, label?: string }, ...]
      axis1Shape: GridShape
      axis2Shape: GridShape
      style: "lines" | "table"
      cellShading: boolean
    }
  }

ArrangementResult (output from coordinateOffsets):
  {
    offsets: Map<nodeId, { dx: number, dy: number }>
    guide?: CoordinateGuide
  }
```

---

## Constants

```
┌──────────────────────────────────────────────────────────────┐
│              System Constants (coordinate-engine.ts)         │
└──────────────────────────────────────────────────────────────┘

MISSING_VALUE_GAP_FRACTION = 0.15
  → When a node has no value for an axis, place it at
    max_value + (range * 0.15) to visually separate from rest

GRID_EXPR_SAMPLES = 20
  → Sample expression-based grid at 20 points for line generation

GRID_DEDUP_PRECISION = 1000
  → Round grid positions to 3 decimal places before deduplication

FORMAT_INTEGER_THRESHOLD = 0.01
  → If normalized value is within 0.01 of an integer, format as integer

GOLDEN_ANGLE = 2.39996322972865332
  → Angle in radians for phyllotaxis (golden spiral)
  → ≈ τ / φ² where φ = golden ratio

SPACING FORMULA:
  gap = nodeSize × 2 × max(nodeSpacing, groupScale)
  → Max() prevents over-scaling when both factors are multiplied
```

---

## Expression Examples by Use Case

```
CONCENTRIC RINGS:
  r = floor(i / 12) + 1
    i=0→r=1, i=12→r=2, i=24→r=3

RADIAL SPOKES:
  θ = (i % 8) * 45°
    i=0→0°, i=1→45°, i=2→90°, ...

PHYLLOTAXIS (SUNFLOWER):
  r = sqrt(i)
  θ = i * 2.4π  (golden angle)

TRIANGULAR PACKING:
  column = i - floor((-1+sqrt(1+8*i))/2) * ...
  row = floor((-1+sqrt(1+8*i))/2)

CUSTOM: NODES BY DEGREE × TIME:
  x = field:month (property source)
  y = metric:degree (metric source)

CUSTOM: MULTI-RING SPIRAL:
  r = floor(i / 20) + 1 + 0.1 * sin(i * π / 10)
    → concentric rings with wavy boundary
  θ = i * τ / 20  (20 nodes per revolution)
```

