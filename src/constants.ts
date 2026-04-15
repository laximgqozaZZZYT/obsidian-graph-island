/**
 * Named constants for string literals used as type identifiers throughout
 * the codebase.  Keeps the canonical values in one place and lets
 * TypeScript's `as const` narrowing work in switch/case and equality checks.
 *
 * NOTE: The *type* definitions (string-literal unions) remain in types.ts.
 *       These constants are for VALUE-position usage only.
 */

// ---------------------------------------------------------------------------
// Edge / Relation types  (EdgeType union values)
// ---------------------------------------------------------------------------
export const EDGE_TYPE_INHERITANCE = "inheritance" as const;
export const EDGE_TYPE_AGGREGATION = "aggregation" as const;
export const EDGE_TYPE_SEQUENCE = "sequence" as const;
export const EDGE_TYPE_SIMILAR = "similar" as const;
export const EDGE_TYPE_SIBLING = "sibling" as const;
export const EDGE_TYPE_LINK = "link" as const;
export const EDGE_TYPE_TAG = "tag" as const;
export const EDGE_TYPE_HAS_TAG = "has-tag" as const;
export const EDGE_TYPE_INLINE_RELATION = "inline-relation" as const;
export const EDGE_TYPE_NAMED_RELATION = "named-relation" as const;

// ---------------------------------------------------------------------------
// Cluster arrangement types  (ClusterArrangement union values)
// ---------------------------------------------------------------------------
export const ARRANGEMENT_CONCENTRIC = "concentric" as const;
export const ARRANGEMENT_TIMELINE = "timeline" as const;
export const ARRANGEMENT_TRIANGLE = "triangle" as const;
export const ARRANGEMENT_GRID = "grid" as const;
export const ARRANGEMENT_RADIAL = "radial" as const;
export const ARRANGEMENT_PHYLLOTAXIS = "phyllotaxis" as const;
export const ARRANGEMENT_RANDOM = "random" as const;
export const ARRANGEMENT_CUSTOM = "custom" as const;
export const ARRANGEMENT_EGO = "ego" as const;

// ---------------------------------------------------------------------------
// Layout types  (LayoutType union values)
// ---------------------------------------------------------------------------
export const LAYOUT_FORCE = "force" as const;
export const LAYOUT_CONCENTRIC = "concentric" as const;
export const LAYOUT_TREE = "tree" as const;
export const LAYOUT_ARC = "arc" as const;
export const LAYOUT_SUNBURST = "sunburst" as const;
export const LAYOUT_TIMELINE = "timeline" as const;

// ---------------------------------------------------------------------------
// View modes  (ViewMode union values)
// ---------------------------------------------------------------------------
export const VIEW_MODE_GRAPH = "graph" as const;
export const VIEW_MODE_SUNBURST = "sunburst" as const;
export const VIEW_MODE_TIMELINE = "timeline" as const;
export const VIEW_MODE_TREE = "tree" as const;
export const VIEW_MODE_MATRIX = "matrix" as const;

// ---------------------------------------------------------------------------
// Coordinate axis source kinds  (AxisSource.kind values)
// ---------------------------------------------------------------------------
export const SOURCE_PROPERTY = "property" as const;
export const SOURCE_INDEX = "index" as const;
export const SOURCE_FIELD = "field" as const;
export const SOURCE_METRIC = "metric" as const;
export const SOURCE_HOP = "hop" as const;
export const SOURCE_RANDOM = "random" as const;
export const SOURCE_CONST = "const" as const;

// ---------------------------------------------------------------------------
// Axis transform kinds  (AxisTransform.kind values)
// ---------------------------------------------------------------------------
export const TRANSFORM_EXPRESSION = "expression" as const;
export const TRANSFORM_EVEN_DIVIDE = "even-divide" as const;
export const TRANSFORM_LINEAR = "linear" as const;
export const TRANSFORM_BIN = "bin" as const;
export const TRANSFORM_DATE_INDEX = "date-to-index" as const;
export const TRANSFORM_STACK_AVOID = "stack-avoid" as const;
export const TRANSFORM_GOLDEN = "golden-angle" as const;
export const TRANSFORM_CURVE = "curve" as const;
export const TRANSFORM_SHAPE_FILL = "shape-fill" as const;

// ---------------------------------------------------------------------------
// Tag display modes
// ---------------------------------------------------------------------------
export const TAG_DISPLAY_NODE = "node" as const;
export const TAG_DISPLAY_ENCLOSURE = "enclosure" as const;

// ---------------------------------------------------------------------------
// Group arrangement modes  (ClusterGroupArrangement values)
// ---------------------------------------------------------------------------
export const GROUP_ARRANGEMENT_AUTO = "auto" as const;
export const GROUP_ARRANGEMENT_CIRCLE = "circle" as const;
export const GROUP_ARRANGEMENT_HORIZONTAL = "horizontal" as const;
export const GROUP_ARRANGEMENT_VERTICAL = "vertical" as const;
export const GROUP_ARRANGEMENT_CONCENTRIC = "concentric" as const;
export const GROUP_ARRANGEMENT_GRID = "grid" as const;

// ---------------------------------------------------------------------------
// Guide types  (ArrangementGuide discriminant values not covered above)
// ---------------------------------------------------------------------------
export const GUIDE_TYPE_COORDINATE = "coordinate" as const;

// ---------------------------------------------------------------------------
// Shape fill kinds  (ShapeFillKind values)
// ---------------------------------------------------------------------------
export const SHAPE_FILL_TRIANGLE = "triangle" as const;
export const SHAPE_FILL_HEXAGON = "hexagon" as const;
export const SHAPE_FILL_SQUARE = "square" as const;
export const SHAPE_FILL_DIAMOND = "diamond" as const;
export const SHAPE_FILL_CIRCLE = "circle" as const;

// ---------------------------------------------------------------------------
// Custom workspace event names
// ---------------------------------------------------------------------------
export const EVENT_HOVER_NODE = "graph-island:hover-node" as const;
export const EVENT_HIGHLIGHT_NODES = "graph-island:highlight-nodes" as const;
export const EVENT_COMPARE_NODES = "graph-island:compare-nodes" as const;
export const EVENT_SYNC_PANEL = "graph-island:sync-panel" as const;

// ---------------------------------------------------------------------------
// Polar arrangement set (shared by RoadNetworkBuilder, GVC, etc.)
// ---------------------------------------------------------------------------
export const POLAR_ARRANGEMENTS: ReadonlySet<string> = new Set(["concentric", "radial", "phyllotaxis"]);

// ---------------------------------------------------------------------------
// Group label rendering
// ---------------------------------------------------------------------------

/** Zoom threshold below which aggregate cluster summaries replace individual nodes */
export const AGGREGATE_ZOOM_THRESHOLD = 0.25;

export const GROUP_LABEL_PALETTE = [0x6366f1, 0x22d3ee, 0xfb923c, 0xa78bfa, 0x34d399, 0xf472b6, 0xfbbf24, 0x60a5fa];
export const AGGREGATE_PALETTE = [0x60a5fa, 0xf472b6, 0xa78bfa, 0x34d399, 0xfbbf24, 0xfb923c, 0x22d3ee, 0xe879f9];

/** Recompute hull only when centroid drifts > this many px */
export const HULL_DRIFT_THRESHOLD = 50;

// ---- Group label styling ----
export const GROUP_LABEL_FILL = 0xeeeeee;
export const GROUP_LABEL_FILL_HOVERED = 0xffffff;
export const GROUP_LABEL_STROKE_COLOR = 0x000000;
export const GROUP_LABEL_STROKE_WIDTH = 4;
export const GROUP_LABEL_STROKE_WIDTH_AGGREGATE = 6;
export const GROUP_LABEL_BG_COLOR = 0x2a2a3e;
export const GROUP_LABEL_BG_COLOR_AGGREGATE = 0x3a3a5e;
export const GROUP_LABEL_BG_COLOR_HOVERED = 0x4a4a8e;
export const GROUP_LABEL_BG_ALPHA = 0.85;
export const GROUP_LABEL_BG_ALPHA_AGGREGATE = 0.92;
export const GROUP_LABEL_BG_ALPHA_HOVERED = 0.95;
export const GROUP_LABEL_PAD_X = 10;
export const GROUP_LABEL_PAD_Y = 5;
export const GROUP_LABEL_PAD_X_AGGREGATE = 16;
export const GROUP_LABEL_PAD_Y_AGGREGATE = 8;
export const GROUP_LABEL_MIN_FONT_SIZE = 14;

// ---- Aggregate cluster styling ----
/** Scale-down factor for aggregate-mode font sizing */
export const AGGREGATE_FONT_SCALE_FACTOR = 0.15;
export const AGGREGATE_FILL_ALPHA = 0.15;
export const AGGREGATE_OUTLINE_WIDTH = 2;
export const AGGREGATE_OUTLINE_ALPHA = 0.5;
export const AGGREGATE_LABEL_FONT_SIZE = 14;
export const AGGREGATE_LABEL_FILL = 0xffffff;
export const AGGREGATE_LABEL_BG_ALPHA = 0.85;
export const AGGREGATE_LABEL_PAD_X = 12;
export const AGGREGATE_LABEL_PAD_Y = 6;
export const AGGREGATE_LABEL_STROKE_WIDTH = 3;
export const AGGREGATE_LABEL_Y_OFFSET = 20;
export const AGGREGATE_MAX_COUNTER_SCALE = 8;
export const AGGREGATE_CHAR_WIDTH_EST = 8;
export const AGGREGATE_HIT_HEIGHT_EST = 28;
