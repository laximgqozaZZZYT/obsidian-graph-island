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

// ---------------------------------------------------------------------------
// Toast durations (ms)
// ---------------------------------------------------------------------------
export const TOAST_SHORT_MS = 2000;

// ---------------------------------------------------------------------------
// Label metrics
// ---------------------------------------------------------------------------
export const LABEL_CHAR_WIDTH_FACTOR = 0.6;

// ===========================================================================
// === Render Constants ===
// Consolidated rendering constants (colors, alphas, thresholds, sizes).
// Previously scattered across: EdgeRenderer.ts, RenderPipeline.ts,
// EdgeLabelRenderer.ts, EnclosureRenderer.ts, CableTrayRenderer.ts.
// ===========================================================================

// ---- Edge color palette (EdgeRenderer) ----
/** blue-400 — wikilink (primary relationship) */
export const LINK_COLOR = 0x60a5fa;
/** cyan-400 — shared-tag co-occurrence */
export const TAG_EDGE_COLOR = 0x22d3ee;
/** violet-400 — shared-category */
export const CATEGORY_EDGE_COLOR = 0xa78bfa;
/** orange-400 — semantic/related */
export const SEMANTIC_EDGE_COLOR = 0xfb923c;
/** purple-500 — hierarchy/inheritance */
export const INHERITANCE_COLOR = 0x8b5cf6;
/** blue-500 — composition/aggregation */
export const AGGREGATION_COLOR = 0x3b82f6;
/** amber-500 — similarity/semantic */
export const SIMILAR_COLOR = 0xf59e0b;
/** gray-500 — tag membership (subtle) */
export const HAS_TAG_COLOR = 0x6b7280;
/** emerald-500 — peer relationship */
export const SIBLING_COLOR = 0x10b981;
/** red-500 — sequential order (directional) */
export const SEQUENCE_COLOR = 0xef4444;
/** teal-500 — explicit inline annotation */
export const INLINE_RELATION_COLOR = 0x14b8a6;

// ---- Edge bundling (EdgeRenderer) ----
/** Number of angular bins over [0, π). 6 bins = 30° each. */
export const ANGLE_BINS = 6;
export const BIN_WIDTH = Math.PI / ANGLE_BINS;
/** Spatial grid cell size in pixels for locality-aware bundling */
export const GRID_CELL = 200;
/** Minimum edges in a direction-color-cell group to activate bundling */
export const MIN_BUNDLE_SIZE = 4;
/** Recompute bundles every Nth frame during animation (reduces cost by ~66%) */
export const BUNDLE_SKIP = 3;

// ---- Edge alpha / thickness (EdgeRenderer) ----
/** Edge alpha for structural edge types */
export const STRUCTURAL_EDGE_ALPHA = 0.7;
/** Edge alpha for non-structural edge types */
export const NON_STRUCTURAL_EDGE_ALPHA = 0.65;
/** Default line thickness for edges */
export const DEFAULT_LINE_THICKNESS = 2;
/** Edge weight additional thickness per log2 step */
export const WEIGHT_THICKNESS_FACTOR = 0.6;
/** Fade-by-degree minimum alpha fraction */
export const FADE_BY_DEGREE_MIN_ALPHA = 0.3;
/** Alpha for relation-colored edges */
export const RELATION_COLOR_ALPHA = 0.8;
/** Multiplier applied to edge thickness when highlighted (hover/focus). */
export const HIGHLIGHT_THICKNESS_MULTIPLIER = 2.5;

// ---- Arc / arrow marker geometry (EdgeRenderer) ----
/** Arc layout control point height factor */
export const ARC_CP_HEIGHT_FACTOR = 0.3;
/** Arc layout control point vertical offset */
export const ARC_CP_VERTICAL_OFFSET = 20;
/** Arc layout max edge count before disabling curves */
export const ARC_MAX_EDGE_COUNT = 500;
/** Edge marker size for ontology markers */
export const EDGE_MARKER_SIZE = 8;
/** Sequence arrow marker size */
export const SEQUENCE_ARROW_SIZE = 7;
/** Generic arrow minimum size */
export const GENERIC_ARROW_MIN_SIZE = 10;
/** Generic arrow radius proportion */
export const GENERIC_ARROW_RADIUS_FACTOR = 0.35;
/** Generic arrow half-width proportion */
export const GENERIC_ARROW_HALF_WIDTH = 0.45;
/** Generic arrow tip offset from node boundary */
export const GENERIC_ARROW_TIP_OFFSET = 2;
/** Sequence/ontology arrow half-width factor */
export const ARROW_HALF_WIDTH_FACTOR = 0.4;
/** Edge marker stroke width */
export const MARKER_STROKE_WIDTH = 1.5;
/** Edge marker fill alpha ratio (relative to line alpha) */
export const MARKER_FILL_ALPHA_RATIO = 0.9;
/** Edge marker half-width ratio (for inheritance triangle and aggregation diamond) */
export const MARKER_HALF_WIDTH = 0.5;

// ---- Edge density adaptation (EdgeRenderer) ----
/** Density scale: edge count threshold for full alpha */
export const DENSITY_FULL_ALPHA_THRESHOLD = 100;
/** Density scale: gentle fade upper bound */
export const DENSITY_GENTLE_THRESHOLD = 500;
/** Density scale: aggressive fade upper bound */
export const DENSITY_AGGRESSIVE_THRESHOLD = 2000;
/** Density scale: gentle fade reduction factor */
export const DENSITY_GENTLE_REDUCTION = 0.35;
/** Density scale: aggressive fade mid-alpha */
export const DENSITY_AGGRESSIVE_MID_ALPHA = 0.65;
/** Density scale: aggressive fade reduction */
export const DENSITY_AGGRESSIVE_REDUCTION = 0.35;
/** Density scale: floor alpha */
export const DENSITY_MIN_ALPHA = 0.4;
/** Zoom fade threshold for extreme zoom-out */
export const ZOOM_FADE_THRESHOLD = 0.05;
/** Zoom fade minimum alpha */
export const ZOOM_FADE_MIN_ALPHA = 0.4;
/** Default density floor */
export const DEFAULT_DENSITY_FLOOR = 0.25;

// ---- Render pipeline (RenderPipeline) ----
export const EDGE_REDRAW_SKIP = 3;
/** Number of frames the render loop idles before detaching the ticker */
export const IDLE_FRAME_DETACH_THRESHOLD = 60;
/** Screen-space node radius estimate used for LOD tier calculations (px) */
export const NODE_SCREEN_PX_BASE = 30;
/** Minimum world radius applied at non-extreme zoom to keep nodes visible.
 *  Nodes are always at least 2×this value in screen-pixel diameter. */
export const MIN_WORLD_RADIUS_PX = 3;
/** Viewport culling margin in world units (divided by worldScale) */
export const VIEWPORT_CULL_MARGIN_PX = 60;
/** Number of nodes created synchronously before deferring the rest */
export const IMMEDIATE_BATCH_SIZE = 50;
/** Number of nodes processed per deferred batch frame (higher = faster initial render) */
export const DEFERRED_BATCH_SIZE = 500;
/** Hold indicator ring line width */
export const HOLD_RING_LINE_WIDTH = 2;
/** Hold indicator ring padding beyond node radius */
export const HOLD_RING_PADDING = 4;
/** Hold ring / pathfinder ring stroke alpha */
export const INDICATOR_RING_ALPHA = 0.9;
/** Maximum proximity candidates for zone placement to limit O(n^2) cost */
export const ZONE_MAX_PROXIMITY_CANDIDATES = 20;
/** Super node fill alpha */
export const SUPER_NODE_FILL_ALPHA = 0.3;
/** Spatial hash grid cell size for label overlap detection (screen px) */
export const OVERLAP_GRID_CELL_SIZE = 120;

/** Keyboard focus ring constants */
export const KB_FOCUS = {
	SEGMENTS: 12,
	GAP_FRACTION: 0.4,
	RADIUS_FACTOR: 1.6,
	LINE_WIDTH: 2.5,
	LINE_ALPHA: 0.95,
} as const;

/** Label layout metrics */
export const LABEL_LAYOUT = {
	LINE_HEIGHT_FACTOR: 1.3,
	EDGE_OFFSET: 2,
	TAG_BG_ALPHA_DAMPEN: 0.7,
} as const;

/** Label background pill padding (px) per node type */
export const LABEL_PAD = {
	SUPER_X: 10, SUPER_Y: 4,
	REGULAR_X: 8, REGULAR_Y: 3,
	TAG_X: 4, TAG_Y: 1,
} as const;

/** Sub-label rendering constants */
export const SUB_LABEL = {
	FONT_SIZE: 9,
	ALPHA: 0.6,
	GAP: 2,
} as const;

// ---- Edge labels (EdgeLabelRenderer) ----
export const EDGE_LABEL_FONT_SIZE_DEFAULT = 10;
/** A11y: edge label background for contrast (WCAG 1.4.3) */
export const EDGE_LABEL_BG_ALPHA = 0.75;
/** Edge label alpha */
export const EDGE_LABEL_ALPHA = 0.7;
/** Edge label resolution */
export const EDGE_LABEL_RESOLUTION = 2;
/** Maximum number of edge labels rendered */
export const MAX_EDGE_LABELS = 200;
/** Estimated half-width of an edge label (px) for collision detection */
export const SMART_LABEL_HW = 25;
/** Estimated half-height of an edge label (px) for collision detection */
export const SMART_LABEL_HH = 7;
/** Shift distance per collision attempt */
export const SMART_SHIFT_STEP = 12;
/** Maximum shift attempts before giving up */
export const SMART_MAX_SHIFTS = 4;
/** Perpendicular offset from edge for label placement */
export const PERPENDICULAR_OFFSET = 8;

// ---- Cable tray (CableTrayRenderer) ----
/** Highlighted cable trunk width */
export const HIGHLIGHT_CABLE_TRUNK_WIDTH = 3;
/** Cable fan crowd attenuation threshold (edges) */
export const CABLE_FAN_CROWD_THRESHOLD = 6.0;
/** Cable fan crowd min alpha fraction */
export const CABLE_FAN_CROWD_MIN_FRACTION = 0.4;
/** Cable lane spacing in screen pixels — wide enough to distinguish parallel cables */
export const CABLE_LANE_SPACING = 14;
/** Trunk conduit alpha — semi-transparent so wires show through */
export const TRUNK_CONDUIT_ALPHA = 0.12;
/** Wire alpha — most opaque layer, clearly visible */
export const WIRE_BASE_ALPHA = 0.9;
/** Wire spacing within a cable (screen pixels between parallel wires) */
export const STUB_WIRE_SPACING = 7;
/** Maximum conduit width in screen pixels */
export const MAX_CONDUIT_WIDTH = 16;
/** Trunk conduit screen width (px) — thickest layer */
export const TRUNK_SCREEN_WIDTH = 12;
/** Cable conduit screen width (px) — medium layer */
export const CABLE_SCREEN_WIDTH = 6;
/** Wire screen width (px) — thinnest layer */
export const WIRE_SCREEN_WIDTH = 2.5;
/** Default fallback cluster radius */
export const DEFAULT_CLUSTER_RADIUS = 50;

// ---- Enclosure (EnclosureRenderer) ----
/** Minimum extra padding beyond node radius for the outline. */
export const OUTLINE_PAD_MIN = 10;
/** Padding scales with node radius: pad = max(MIN, radius × factor) */
export const OUTLINE_PAD_FACTOR = 0.8;
/** Number of sample points around each node circle for hull generation. */
export const HULL_SAMPLES = 24;
/** Overlap re-computation interval in frames */
export const OVERLAP_RECOMPUTE_FRAMES = 30;
/** Size fade divisor: large groups → lower alpha */
export const SIZE_FADE_DIVISOR = 200;
/** Base fill alpha for non-overlapping enclosures (zoomed out) */
export const FILL_ALPHA_BASE = 0.1;
/** Base fill alpha for overlapping enclosures (zoomed out) */
export const FILL_ALPHA_OVERLAP = 0.04;
/** Maximum label collision resolution attempts */
export const LABEL_COLLISION_MAX_ATTEMPTS = 6;
/** Stroke alpha for non-overlapping enclosures — bold border like map boundaries */
export const STROKE_ALPHA_NO_OVERLAP = 0.85;
/** Minimum stroke alpha for overlapping enclosures */
export const STROKE_ALPHA_OVERLAP_MIN = 0.5;
/** Stroke alpha numerator for overlapping enclosures */
export const STROKE_ALPHA_OVERLAP_BASE = 0.75;
/** Stroke line width for non-overlapping enclosures — thick border for map-like appearance */
export const STROKE_WIDTH_NO_OVERLAP = 4.0;
/** Stroke line width base for overlapping enclosures */
export const STROKE_WIDTH_OVERLAP_BASE = 3.5;
/** Minimum stroke width for overlapping enclosures */
export const STROKE_WIDTH_OVERLAP_MIN = 2.5;
/** Outer border width for double-line "map border" effect */
export const BORDER_OUTER_WIDTH = 7.0;
/** Outer border alpha (darker, behind main stroke — higher = more visible border) */
export const BORDER_OUTER_ALPHA_FACTOR = 0.6;
/** Size fade minimum fraction (large groups don't fully disappear) */
export const SIZE_FADE_MIN = 0.3;
/** Fill alpha visibility threshold */
export const FILL_ALPHA_VISIBILITY_THRESHOLD = 0.005;
/** Label darken factor for background pill */
export const LABEL_DARKEN_FACTOR = 0.25;
/** Label pill padding (horizontal) */
export const LABEL_PILL_PAD_X = 8;
/** Label pill padding (vertical) */
export const LABEL_PILL_PAD_Y = 3;
/** Collision escape margin factor */
export const COLLISION_ESCAPE_MARGIN = 0.15;
/** Zoom threshold: below this worldScale the view is considered "zoomed out". */
export const ZOOM_OUT_THRESHOLD = 0.45;

// ===========================================================================
// ---- GraphViewContainer constants ----
// Moved out of GraphViewContainer.ts (GOD OBJECT reduction). GVC_ prefix
// avoids naming collisions with similar constants in this file.
// ===========================================================================

// ---- Timing (ms) ----
export const GVC_SAVE_DEBOUNCE_MS = 500;
export const GVC_ONBOARDING_HELP_DELAY_MS = 500;
export const GVC_ONBOARDING_HINT_DELAY_MS = 3000;
export const GVC_HOVER_PREVIEW_DELAY_MS = 800;
export const GVC_AUTOFIT_DELAY_MS = 600;
export const GVC_ANIMATE_TO_NODE_MS = 500;
export const GVC_FADE_ALPHA_MS = 300;
export const GVC_SEARCH_PULSE_MS = 300;
export const GVC_TOAST_LONG_MS = 5000;

// ---- Cache TTL (ms) ----
export const GVC_FM_KEYS_CACHE_TTL_MS = 5000;

// ---- Thresholds ----
export const GVC_EXTREME_ZOOM_THRESHOLD = 0.15;
export const GVC_MOBILE_NODE_CAP = 200;
export const GVC_LARGE_GRAPH_LOCAL_THRESHOLD = 500;
export const GVC_TRANSITION_SKIP_THRESHOLD = 500;

// ---- Rendering constants ----
export const GVC_GOLDEN_RATIO_FALLBACK = 1.618;
export const GVC_BODY_PREVIEW_MAX_CHARS = 200;
export const GVC_COLLISION_RATE_OK = 0.05;
export const GVC_DIMMED_NODE_ALPHA = 0.12;
export const GVC_SEARCH_HALO_STROKE_WIDTH = 2;
export const GVC_SEARCH_HALO_STROKE_ALPHA = 0.85;
export const GVC_HOVER_TOOLTIP_BG_ALPHA = 0.92;
export const GVC_SEARCH_PULSE_SCALE = 1.3;
export const GVC_ALPHA_EPSILON = 0.01;
export const GVC_ARC_ANGLE_EPSILON = 0.001;
export const GVC_HEATMAP_MIN_VALUE = 0.05;
export const GVC_ZOOM_TO_LABEL_RECT = 400;

// ---- Sunburst fill alpha (ring chart mode) ----
export const GVC_RING_FILL_ALPHA_FLOOR = 0.3;
export const GVC_RING_FILL_ALPHA_BASE = 0.7;
export const GVC_RING_FILL_ALPHA_DEPTH_DECAY = 0.08;

// ---- Link preview ----
export const GVC_LINK_PREVIEW_COLOR = 0x00cccc;
export const GVC_LINK_PREVIEW_DASH: number[] = [8, 6];
export const GVC_LINK_PREVIEW_LINE_WIDTH = 2;
export const GVC_LINK_PREVIEW_LINE_ALPHA = 0.9;
export const GVC_LINK_PREVIEW_SNAP_LINE_WIDTH = 1.5;
export const GVC_LINK_PREVIEW_SNAP_ALPHA = 0.7;
export const GVC_LINK_PREVIEW_SNAP_RADIUS = 8;

// ---- Sunburst fill alpha (normal mode) ----
export const GVC_SUNBURST_FILL_ALPHA_FLOOR = 0.02;
export const GVC_SUNBURST_FILL_ALPHA_BASE = 0.1;
export const GVC_SUNBURST_FILL_ALPHA_DEPTH_DECAY = 0.015;
export const GVC_SUNBURST_STROKE_ALPHA_FLOOR = 0.15;
export const GVC_SUNBURST_STROKE_ALPHA_BASE = 0.4;
export const GVC_SUNBURST_STROKE_ALPHA_DEPTH_DECAY = 0.05;

// ---- Default canvas size (fallback when DOM not yet measured) ----
export const GVC_DEFAULT_CANVAS_WIDTH = 600;
export const GVC_DEFAULT_CANVAS_HEIGHT = 400;

// ---- All preset definitions — single source of truth for applyPreset / applyPresetByKey / getPresetSummary ----
export const GVC_ALL_PRESETS: Record<string, Record<string, unknown>> = {
	// Quick presets
	simple: {
		showLinks: true,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: false,
	},
	analysis: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: true,
		showSemanticEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSibling: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		nodeColorMode: "category",
		showEdgeLabels: false,
		showArrows: true,
	},
	creative: {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: false,
		showSemanticEdges: true,
		showInheritance: false,
		showAggregation: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		tagDisplay: "enclosure",
		showTagNodes: true,
	},
	"active-focus": {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 2,
		focusLayout: true,
		hoverHops: 1,
		showArrows: true,
		fadeEdgesByDegree: true,
	},
	"semantic-shapes": {
		nodeShapeRules: [
			{ match: "category" as const, category: "character", shape: "circle" as const },
			{ match: "category" as const, category: "place", shape: "hexagon" as const },
			{ match: "category" as const, category: "event", shape: "diamond" as const },
			{ match: "category" as const, category: "concept", shape: "triangle" as const },
			{ match: "default" as const, shape: "square" as const },
		],
	},
	"full-analysis": {
		showLinks: true,
		showTagEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSequence: true,
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showGraphStats: true,
		showBridgeNodes: true,
		showImportanceRing: true,
		nodeColorMode: "community",
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
	},
	// Thinking modes (M1)
	explore: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 3,
		focusLayout: true,
		focusConeEnabled: true,
		hoverHops: 2,
		showGapEdges: true,
		showSimilarSuggestions: true,
		fadeEdgesByDegree: true,
		showArrows: false,
		nodeColorMode: "category",
	},
	analyze: {
		syncWithEditor: false,
		localGraphCenter: null,
		showGraphStats: true,
		showBridgeNodes: true,
		showEntropyOverlay: true,
		highlightMissingNeighbors: true,
		nodeColorMode: "community",
		colorEdgesByRelation: true,
		fadeEdgesByDegree: true,
		showArrows: true,
		showOntologyBackbone: true,
		showHierarchyTree: true,
		directionalGravityRules: [{ filter: "type:inheritance", direction: "bottom", strength: 0.08 }],
	},
	write: {
		syncWithEditor: true,
		localGraphCenter: "__active__",
		localGraphHops: 1,
		focusLayout: true,
		presentationMode: true,
		hoverHops: 1,
		showArrows: false,
		fadeEdgesByDegree: false,
		nodeColorMode: "category",
		nodeSize: 25,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showSimilar: false,
		focusConeEnabled: true,
	},
};

// ---- localStorage keys (first-launch flags) ----
export const GVC_ONBOARDING_KEY = "graph-island-onboarding-shown";
export const GVC_SR_GUIDE_KEY = "gi-sr-guide-shown";

// ---- Thumbnail overlay (node image previews) ----
export const GVC_MAX_THUMBNAILS = 50;
export const GVC_THUMBNAIL_VIEWPORT_MARGIN = 50;

// ---- Density heatmap (grid-based node density visualization) ----
export const GVC_HEATMAP_CELL_SIZE = 40;
export const GVC_HEATMAP_GAUSSIAN_RADIUS = 3;

// ---- Progressive simulation rendering (sync positions every N ticks) ----
export const GVC_PROGRESSIVE_INTERVAL = 10;
