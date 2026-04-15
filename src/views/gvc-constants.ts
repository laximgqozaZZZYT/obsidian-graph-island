// ---- Timing (ms) ----
export const SAVE_DEBOUNCE_MS = 500;
export const ONBOARDING_HELP_DELAY_MS = 500;
export const ONBOARDING_HINT_DELAY_MS = 3000;
export const HOVER_PREVIEW_DELAY_MS = 800;
export const AUTOFIT_DELAY_MS = 600;
export const ANIMATE_TO_NODE_MS = 500;
export const FADE_ALPHA_MS = 300;
export const SEARCH_PULSE_MS = 300;

// ---- Toast / Notice durations (ms) ----
export const TOAST_SHORT_MS = 2000;
export const TOAST_LONG_MS = 5000;

// ---- Cache TTL (ms) ----
export const FM_KEYS_CACHE_TTL_MS = 5000;

// ---- Thresholds ----
export const EXTREME_ZOOM_THRESHOLD = 0.15;
export const MOBILE_NODE_CAP = 200;
export const LARGE_GRAPH_LOCAL_THRESHOLD = 500;
export const TRANSITION_SKIP_THRESHOLD = 500;

// ---- Rendering constants ----
export const GOLDEN_RATIO_FALLBACK = 1.618;
export const BODY_PREVIEW_MAX_CHARS = 200;
export const COLLISION_RATE_OK = 0.05;
export const DIMMED_NODE_ALPHA = 0.12;
export const SEARCH_HALO_STROKE_WIDTH = 2;
export const SEARCH_HALO_STROKE_ALPHA = 0.85;
export const HOVER_TOOLTIP_BG_ALPHA = 0.92;
export const SEARCH_PULSE_SCALE = 1.3;
export const ALPHA_EPSILON = 0.01;
export const ARC_ANGLE_EPSILON = 0.001;
export const HEATMAP_MIN_VALUE = 0.05;
export const ZOOM_TO_LABEL_RECT = 400;

// ---- Sunburst fill alpha (ring chart mode) ----
export const RING_FILL_ALPHA_FLOOR = 0.3;
export const RING_FILL_ALPHA_BASE = 0.7;
export const RING_FILL_ALPHA_DEPTH_DECAY = 0.08;

// ---- Link preview ----
export const LINK_PREVIEW_COLOR = 0x00cccc;
export const LINK_PREVIEW_DASH = [8, 6] as const;
export const LINK_PREVIEW_LINE_WIDTH = 2;
export const LINK_PREVIEW_LINE_ALPHA = 0.9;
export const LINK_PREVIEW_SNAP_LINE_WIDTH = 1.5;
export const LINK_PREVIEW_SNAP_ALPHA = 0.7;
export const LINK_PREVIEW_SNAP_RADIUS = 8;

// ---- Sunburst fill alpha (normal mode) ----
export const SUNBURST_FILL_ALPHA_FLOOR = 0.02;
export const SUNBURST_FILL_ALPHA_BASE = 0.1;
export const SUNBURST_FILL_ALPHA_DEPTH_DECAY = 0.015;
export const SUNBURST_STROKE_ALPHA_FLOOR = 0.15;
export const SUNBURST_STROKE_ALPHA_BASE = 0.4;
export const SUNBURST_STROKE_ALPHA_DEPTH_DECAY = 0.05;

// ---- Canvas fallback dimensions ----
export const DEFAULT_CANVAS_WIDTH = 600;
export const DEFAULT_CANVAS_HEIGHT = 400;

// ---- Onboarding ----
export const ONBOARDING_KEY = "graph-island-onboarding-shown";

// ---- Thumbnails ----
export const MAX_THUMBNAILS = 50;

// ---- Layout margins ----
export const THUMBNAIL_MARGIN = 50;
