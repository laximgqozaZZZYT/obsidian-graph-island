# Research: SCREAMING_CASE Constants Scattered Across Codebase

**Date**: 2026-04-06  
**Researcher**: Claude Code  
**Issue**: [014-scattered-constants.md](../ISSUES/014-scattered-constants.md)

---

## Executive Summary

Analysis of 338 SCREAMING_CASE constants found across 45 TypeScript files in the Graph Island plugin:

- **57 exported** constants (API surface)
- **281 file-local** constants
- **~99 constants should be centralized** into `src/constants.ts`
- **~223 constants correctly kept as file-local** (implementation details)
- **3 duplicated constants** found and require deduplication

**Recommendation**: Centralize ~99 user-tunable threshold/dimension constants in logical groups; keep file-local implementation details where they are.

---

## Distribution Overview

### By File Count
- Files with scattered constants: **45**
- Largest offenders:
  1. `GraphViewContainer.ts` - 102 constants
  2. `EdgeRenderer.ts` - 74 constants
  3. `RenderPipeline.ts` - 48 constants
  4. `EnclosureRenderer.ts` - 20 constants
  5. `group-label-manager.ts` - 30 constants

### By Export Status
```
Exported:    57 constants (16.9%)
File-local: 281 constants (83.1%)
```

### By Category
| Category | Count | Action |
|----------|-------|--------|
| Should Centralize | ~99 | Move to constants.ts |
| OK as File-Local | ~223 | Keep as-is |
| Not Real Constants | ~16 | Already handled |
| **Total** | **338** | |

---

## CATEGORY 1: Should Centralize (~99 constants)

These are user-tunable thresholds, performance parameters, and layout dimensions that would benefit from centralization.

### 1a. Render Performance Thresholds (34 constants)
**Purpose**: Control visual quality and rendering performance for dense graphs

**Current locations**: EdgeRenderer.ts, RenderPipeline.ts, GraphViewContainer.ts, render-pipeline-utils.ts

**Constants**:
- `DENSITY_FULL_ALPHA_THRESHOLD = 100`
- `DENSITY_GENTLE_THRESHOLD = 500`
- `DENSITY_AGGRESSIVE_THRESHOLD = 2000`
- `DENSITY_MIN_ALPHA = 0.4`
- `DENSITY_GENTLE_REDUCTION = 0.35`
- `DENSITY_AGGRESSIVE_REDUCTION = 0.35`
- `DENSITY_AGGRESSIVE_MID_ALPHA = 0.65`
- `FADE_BY_DEGREE_MIN_ALPHA = 0.3`
- `ZOOM_FADE_THRESHOLD = 0.05`
- `ZOOM_FADE_MIN_ALPHA = 0.4`
- `GLOW_ATTENUATE_THRESHOLD = 300`
- `GLOW_ATTENUATE_RANGE = 500`
- `GLOW_RADIUS_ATTENUATE_FACTOR = 0.7`
- `GLOW_P90_FRACTION = 0.9`
- `DEFERRED_BATCH_SIZE = 500`
- `IMMEDIATE_BATCH_SIZE = 50`
- `EDGE_REDRAW_SKIP = 3`
- `VIEWPORT_CULL_MARGIN_PX = 60`
- `OVERLAP_GRID_CELL_SIZE = 120`
- `NODE_SCREEN_PX_BASE = 30`
- `IDLE_FRAME_DETACH_THRESHOLD = 60`
- `LARGE_GRAPH_LOCAL_THRESHOLD = 500`
- `EXTREME_ZOOM_THRESHOLD = 0.15`
- `AGGREGATE_ZOOM_THRESHOLD = 0.25` (DUPLICATED - also in RenderHelpers.ts)
- `GRID_CELL = 200`
- `ARC_MAX_EDGE_COUNT = 500`
- `MAX_EDGE_LABELS = 200`
- `MIN_BUNDLE_SIZE = 4`
- `BUNDLE_SKIP = 3`
- `ANGLE_BINS = 6`
- `TRANSITION_SKIP_THRESHOLD = 500`
- `ZOOM_LAYOUT_DEBOUNCE_MS = 400`
- `FM_KEYS_CACHE_TTL_MS = 5000`

**Files affected**: EdgeRenderer.ts, RenderPipeline.ts, GraphViewContainer.ts, render-pipeline-utils.ts

**Rationale**: These control quality/performance tradeoffs that users might want to adjust. Currently scattered, making it hard to tune performance globally.

---

### 1b. Layout Thresholds & Dimensions (19 constants)
**Purpose**: Control layout algorithm parameters and visual spacing

**Current locations**: timeline.ts, tree.ts, coordinate-engine.ts, ego-sector.ts

**Constants**:
- `DEFAULT_LANE_HEIGHT = 28` (timeline.ts)
- `DEFAULT_STACK_SPACING = 20` (timeline.ts)
- `DEFAULT_START_X = 60` (timeline.ts)
- `DEFAULT_START_Y = 60` (timeline.ts)
- `DEFAULT_STEP_WIDTH = 120` (timeline.ts)
- `MAX_DESIRED_COLS = 40` (timeline.ts)
- `MIN_STEP_WIDTH = 1` (timeline.ts)
- `UNTIMED_NODE_SPACING_FACTOR = 0.6` (timeline.ts)
- `DEFAULT_TREE_GAP = 80` (tree.ts)
- `DEFAULT_LEVEL_HEIGHT = 80` (tree.ts)
- `DEFAULT_NODE_WIDTH = 60` (tree.ts)
- `DEFAULT_CATEGORY_GAP = 40` (tree.ts)
- `MIN_FANOUT = 3` (tree.ts)
- `EGO_RING_RADIUS = 150` (ego-sector.ts)
- `GRID_DEDUP_PRECISION = 1000` (coordinate-engine.ts)
- `GRID_EXPR_SAMPLES = 20` (coordinate-engine.ts)
- `FORMAT_INTEGER_THRESHOLD = 0.01` (coordinate-engine.ts)
- `MISSING_VALUE_GAP_FRACTION = 0.15` (coordinate-engine.ts)
- `GOLDEN_ANGLE = 2.3999632297286535` (coordinate-engine.ts)

**Rationale**: These define layout appearance. Centralizing allows fine-tuning layouts consistently across all arrangement types.

---

### 1c. Zoom & Interaction Behavior (8 constants)
**Purpose**: Control zoom sensitivity and transition duration

**Current locations**: InteractionManager.ts, LayoutTransition.ts, GraphViewContainer.ts

**Constants**:
- `ZOOM_IN_FACTOR = 1.1` (InteractionManager.ts)
- `ZOOM_OUT_FACTOR = 0.9` (InteractionManager.ts)
- `ZOOM_SCALE_MIN = 0.02` (InteractionManager.ts)
- `ZOOM_SCALE_MAX = 10` (InteractionManager.ts)
- `LAYOUT_TRANSITION_DURATION_MS = 600` (LayoutTransition.ts)
- `LAYOUT_LARGE_GRAPH_THRESHOLD = 1000` (LayoutTransition.ts)
- `TRANSITION_DURATION_LARGE_MS = 300` (LayoutTransition.ts)
- `SAVE_DEBOUNCE_MS = 500` (GraphViewContainer.ts)

**Rationale**: These are user-visible interaction parameters that should be easily discoverable and tunable.

---

### 1d. Animation & Timing (9 constants)
**Purpose**: Control UI feedback timing

**Current locations**: GraphViewContainer.ts

**Constants**:
- `ANIMATE_TO_NODE_MS = 500`
- `HOVER_PREVIEW_DELAY_MS = 800`
- `FADE_ALPHA_MS = 300`
- `ONBOARDING_HELP_DELAY_MS = 500`
- `ONBOARDING_HINT_DELAY_MS = 3000`
- `TOAST_SHORT_MS = 2000`
- `TOAST_MEDIUM_MS = 3000`
- `TOAST_LONG_MS = 5000`
- `SEARCH_PULSE_MS = 300`

**Rationale**: Feedback timing is user-facing and might need adjustment for accessibility or user preference.

---

### 1e. Cable Tray Rendering (12 constants)
**Purpose**: Control edge bundling and cable visualization

**Current locations**: CableTrayRenderer.ts (all exported)

**Constants**:
- `CABLE_LANE_SPACING = 14`
- `TRUNK_CONDUIT_ALPHA = 0.12`
- `WIRE_BASE_ALPHA = 0.9`
- `STUB_WIRE_SPACING = 7`
- `MAX_CONDUIT_WIDTH = 16`
- `TRUNK_SCREEN_WIDTH = 12`
- `CABLE_SCREEN_WIDTH = 6`
- `WIRE_SCREEN_WIDTH = 2.5`
- `CABLE_FAN_CROWD_THRESHOLD = 6.0`
- `CABLE_FAN_CROWD_MIN_FRACTION = 0.4`
- `HIGHLIGHT_CABLE_TRUNK_WIDTH = 3`
- `DEFAULT_CLUSTER_RADIUS = 50`

**Rationale**: Already exported; consolidating in constants.ts improves organization.

---

### 1f. Edge Drawing Configuration (11 constants)
**Purpose**: Control edge appearance and rendering

**Current locations**: EdgeRenderer.ts (all exported)

**Constants**:
- `DEFAULT_LINE_THICKNESS = 2`
- `STRUCTURAL_EDGE_ALPHA = 0.7`
- `NON_STRUCTURAL_EDGE_ALPHA = 0.65`
- `WEIGHT_THICKNESS_FACTOR = 0.6`
- `HIGHLIGHT_THICKNESS_MULTIPLIER = 2.5`
- `RELATION_COLOR_ALPHA = 0.8`
- `DEFAULT_DENSITY_FLOOR = 0.25`

**Rationale**: Already exported; centralizing improves discoverability.

---

### 1g. Minimap (9 constants)
**Purpose**: Control minimap dimensions and appearance

**Current locations**: Minimap.ts

**Constants**:
- `MINIMAP_WIDTH = 180`
- `MINIMAP_HEIGHT = 120`
- `MINIMAP_VIEWPORT_LINE_WIDTH = 1.5`
- `MINIMAP_VIEWPORT_MIN_SIZE = 2`
- `MINIMAP_BOUNDS_PAD = 50`
- `MINIMAP_LARGE_GRAPH_THRESHOLD = 2000`
- `MINIMAP_MEDIUM_GRAPH_THRESHOLD = 500`
- `MINIMAP_DOT_SCALE_MEDIUM = 0.8`
- `MINIMAP_DOT_SCALE_LARGE = 0.6`

**Rationale**: Minimap sizing affects UI layout; centralizing makes it easier to tune sidebar dimensions.

---

### 1h. Tag Relation Detection (2 constants)
**Purpose**: Algorithm parameters for tag co-occurrence detection

**Current locations**: tag-relation-presets.ts

**Constants**:
- `MIN_COOCCURRENCE_RATIO = 0.6`
- `MIN_TAG_COUNT = 2`

**Rationale**: Algorithm sensitivity parameters; centralizing keeps all tuning knobs visible.

---

## CATEGORY 2: OK as File-Local (~223 constants)

These are tightly coupled to their rendering/algorithm context and should NOT be centralized.

### 2a. Color Palettes & Edge Colors (~60 constants)
**Files**: GraphViewContainer.ts, EdgeRenderer.ts, group-label-manager.ts, DiffOverlay.ts, EnclosureRenderer.ts

**Examples**:
- `LINK_COLOR = 0x60a5fa` (EdgeRenderer.ts)
- `INHERITANCE_COLOR = 0x8b5cf6` (EdgeRenderer.ts)
- `TAG_EDGE_COLOR = 0x22d3ee` (EdgeRenderer.ts)
- `GROUP_LABEL_BG_COLOR = 0x2a2a3e` (group-label-manager.ts)
- `ADDED_COLOR = "#22c55e"` (DiffOverlay.ts)
- `PATHFINDER_COLOR = 0x00ced1` (GraphViewContainer.ts)

**Rationale**: 
- These are tightly coupled to rendering logic in their modules
- Not used across multiple files
- Changing colors independently without understanding the context would break visual coherence
- Not typically tuned by users (unlike thresholds)

---

### 2b. Label Rendering Geometry (~40 constants)
**Files**: RenderPipeline.ts, EdgeRenderer.ts, card-renderer.ts, cluster-force.ts

**Examples**:
- `LABEL_CHAR_WIDTH_FACTOR = 0.6` (RenderPipeline.ts, cluster-force.ts)
- `SMART_LABEL_HH = 7` (EdgeRenderer.ts - half-height)
- `SMART_LABEL_HW = 25` (EdgeRenderer.ts - half-width)
- `SMART_MAX_SHIFTS = 4` (EdgeRenderer.ts)
- `CARD_ICON_FILL_ALPHA = 0.25` (card-renderer.ts)
- `REGULAR_LABEL_PAD_X = 8` (RenderPipeline.ts)

**Rationale**:
- Deeply embedded in label collision detection and positioning algorithms
- Changes would require rebalancing multiple parameters
- These are implementation details, not user-tunable settings

---

### 2c. Enclosure & Outline Geometry (~30 constants)
**Files**: EnclosureRenderer.ts, DiffOverlay.ts, node-decorations.ts

**Examples**:
- `BORDER_OUTER_WIDTH = 7.0` (EnclosureRenderer.ts)
- `OUTLINE_PAD_FACTOR = 0.8` (EnclosureRenderer.ts)
- `FILL_ALPHA_BASE = 0.1` (EnclosureRenderer.ts)
- `GHOST_MARGIN = 40` (DiffOverlay.ts)
- `COMPARE_RING_ALPHA = 0.85` (node-decorations.ts)

**Rationale**:
- Specific to visual effects rendering
- No cross-file dependencies
- Part of closed-loop rendering logic

---

### 2d. Pathfinding & Effect Constants (~20 constants)
**Files**: GraphViewContainer.ts, render-pipeline-utils.ts

**Examples**:
- `PATHFINDER_PULSE_AMPLITUDE = 0.1`
- `PATHFINDER_PULSE_SPEED = 0.06`
- `PATHFINDER_GLOW_STROKE_WIDTH = 8`
- `SEARCH_HALO_STROKE_WIDTH = 2`

**Rationale**:
- Algorithm-specific effect parameters
- Tuned as a coordinated set
- Not externally referenced

---

### 2e. Lasso & Selection UI (~10 constants)
**Files**: InteractionManager.ts

**Examples**:
- `LASSO_FILL_ALPHA = 0.06`
- `LASSO_STROKE_ALPHA = 0.9`
- `LASSO_MIN_POINTS = 5`
- `MARQUEE_FILL_ALPHA = 0.08`
- `MARQUEE_STROKE_WIDTH = 1.5`

**Rationale**:
- Self-contained tool behavior
- Not shared across modules
- Implementation details of interaction layer

---

### 2f. Layout Algorithm Internals (~25 constants)
**Files**: tree.ts, timeline.ts, cluster-force.ts, sunburst.ts, coordinate-engine.ts

**Examples**:
- `COVERAGE_THRESHOLD = 0.5` (sunburst.ts)
- `UNMATCHED_RADIUS_FACTOR = 0.95` (sunburst.ts)
- `BFS_FALLBACK_DEPTH = 999` (coordinate-engine.ts)
- `LABEL_PAD_X_REGULAR = 8` (cluster-force.ts)

**Rationale**:
- Integral to algorithm correctness
- Changing would require deep understanding of layout logic
- Not meant for external tuning

---

### 2g. WebGL & Graphics Infrastructure (~10 constants)
**Files**: WebGLGraphics.ts, shaders.ts, tessellator.ts

**Examples**:
- `FLOATS_PER_VERTEX = 6` (WebGLGraphics.ts)
- `CORNER_SEGMENTS = 8` (tessellator.ts)
- Shader source code constants

**Rationale**:
- Tied to graphics API contracts
- Cannot be changed without refactoring graphics pipeline
- Not user-tunable

---

### 2h. Hash & Crypto Constants (~5 constants)
**Files**: snapshot.ts, spatial-grid.ts

**Examples**:
- `FNV_OFFSET = 0x811c9dc5` (FNV-1a hash)
- `FNV_PRIME = 0x01000193` (FNV-1a hash)
- `HASH_PRIME = 73856093` (spatial grid hash)

**Rationale**:
- Algorithm-specific magic numbers
- Changing breaks hashing
- Not user parameters

---

### 2i. Domain Logic Identifiers (~15 constants)
**Files**: PanelBuilder.ts, coord-panel.ts, presets.ts, query-expr.ts, graph-filter.ts

**Examples**:
- `BUILT_IN_FIELDS = Set(["path", "file", "folder", "tag", "category", "id", "isTag"])`
- `METRIC_NAMES = Set([...])` (appears in 3 files)
- `BOOL_OPS = Set(["AND", "OR", "XOR", "NOR", "NAND", "NOT"])`
- `ATTACHMENT_EXTS = Set([...])`

**Rationale**:
- These are domain vocabularies, not tunable parameters
- Used in validation logic
- Part of plugin's semantic definition

---

### 2j. View Type & Storage Keys (8 constants)
**Files**: GraphViewContainer.ts, NodeComparisonView.ts, NodeDetailView.ts, PanelBuilder.ts, SnapshotManager.ts

**Examples**:
- `VIEW_TYPE_GRAPH = "graph-view"`
- `VIEW_TYPE_NODE_COMPARE = "graph-node-compare"`
- `VIEW_TYPE_NODE_DETAIL = "graph-node-detail"`
- `NODE_DIR_STATE_KEY = "graph-island-node-dir-state"`
- `SECTION_STATE_KEY = "graph-island-section-state"`

**Rationale**:
- These are Obsidian API contracts
- Storage key changes break serialization
- Not user-tunable

---

### 2k. Math Constants (~3 constants)
**Files**: node-shapes.ts, coordinate-engine.ts

**Examples**:
- `SQRT3_HALF = Math.sqrt(3) / 2` (~0.866)
- `GOLDEN_ANGLE = 2.3999632297286535`

**Rationale**:
- Derived values from mathematical formulas
- No benefit to centralizing
- Used locally in geometric calculations

---

## CATEGORY 3: Duplicated Constants (3 found)

These should be deduplicated:

### 3a. `AGGREGATE_ZOOM_THRESHOLD = 0.25`
**Current locations**:
- `src/views/group-label-manager.ts` (exported)
- `src/views/RenderHelpers.ts` (exported)

**Recommendation**: Keep in `group-label-manager.ts` (primary user); remove from `RenderHelpers.ts` and import it instead.

---

### 3b. `METRIC_NAMES = Set([...])`
**Current locations**:
- `src/utils/transform-expr.ts`
- `src/views/PanelBuilder.ts`
- `src/views/coord-panel.ts`

**Recommendation**: Define once in `transform-expr.ts` (utilities layer); import in PanelBuilder.ts and coord-panel.ts.

---

### 3c. `BUILT_IN_FIELDS = Set([...])`
**Current locations**:
- `src/views/PanelBuilder.ts`
- `src/views/coord-panel.ts`

**Recommendation**: Extract to a shared constants file or utility; both files define identically.

---

## Files Most Impacted by Centralization

If ~99 constants are moved to `constants.ts`, these files will have the most imports:

| File | Est. Imports | Affected Areas |
|------|--------------|----------------|
| `GraphViewContainer.ts` | 35 | render thresholds, timing, zoom, minimap |
| `RenderPipeline.ts` | 25 | render performance, density thresholds |
| `EdgeRenderer.ts` | 15 | edge config, density, line thickness |
| `InteractionManager.ts` | 4 | zoom factors, debounce |
| `timeline.ts` | 8 | layout dimensions |
| `tree.ts` | 5 | layout dimensions |
| `Minimap.ts` | 9 | minimap dimensions |
| `LayoutTransition.ts` | 3 | transition timing |

---

## Implementation Strategy

### Phase 1: Add to constants.ts
Organize constants into logical sections:

```typescript
// ---------------------------------------------------------------------------
// Render Performance Thresholds
// ---------------------------------------------------------------------------
export const DENSITY_FULL_ALPHA_THRESHOLD = 100;
// ... etc

// ---------------------------------------------------------------------------
// Layout Dimensions
// ---------------------------------------------------------------------------
export const DEFAULT_LANE_HEIGHT = 28;
// ... etc

// ---------------------------------------------------------------------------
// Zoom & Interaction Behavior
// ---------------------------------------------------------------------------
export const ZOOM_IN_FACTOR = 1.1;
// ... etc

// [Additional sections as shown above]
```

### Phase 2: Remove from Source Files
For each file with constants to be centralized:
1. Remove constant declarations
2. Add import: `import { CONSTANT_NAME, ... } from '../constants'` (or from relative path)

### Phase 3: Deduplicate
1. Remove duplicate `AGGREGATE_ZOOM_THRESHOLD` from `RenderHelpers.ts`
2. Make `METRIC_NAMES` and `BUILT_IN_FIELDS` single-source-of-truth

### Phase 4: Test
- Verify all imports resolve correctly
- Run `pnpm lint` to catch missing imports
- Run `pnpm test` to ensure no behavioral changes

---

## Proposed Structure in constants.ts

```typescript
/**
 * Render performance tuning parameters.
 * These control visual quality vs. performance tradeoffs in dense graphs.
 */
export const DENSITY_FULL_ALPHA_THRESHOLD = 100;
export const DENSITY_GENTLE_THRESHOLD = 500;
export const DENSITY_AGGRESSIVE_THRESHOLD = 2000;
// ... [remaining render constants]

/**
 * Layout algorithm parameters affecting visual spacing and dimensions.
 * Adjust these to fine-tune layout appearance across all arrangement types.
 */
export const DEFAULT_LANE_HEIGHT = 28;
export const DEFAULT_STEP_WIDTH = 120;
// ... [remaining layout constants]

/**
 * User interaction parameters (zoom, animation timing, feedback delays).
 * These are user-facing and may need adjustment for accessibility.
 */
export const ZOOM_IN_FACTOR = 1.1;
export const ANIMATE_TO_NODE_MS = 500;
// ... [remaining interaction constants]

/**
 * Edge bundling and cable tray rendering parameters.
 */
export const CABLE_LANE_SPACING = 14;
export const WIRE_BASE_ALPHA = 0.9;
// ... [remaining cable constants]

/**
 * Minimap UI dimensions and scaling.
 */
export const MINIMAP_WIDTH = 180;
export const MINIMAP_HEIGHT = 120;
// ... [remaining minimap constants]

/**
 * Tag relation detection algorithm parameters.
 */
export const MIN_COOCCURRENCE_RATIO = 0.6;
export const MIN_TAG_COUNT = 2;
```

---

## Risk Assessment

### Low Risk (Safe to centralize)
- Render performance thresholds (already used with `RenderThresholds` abstraction)
- Layout dimensions (isolated in layout modules)
- Zoom factors (contained in InteractionManager)
- Animation timing (used only in GraphViewContainer)

### Medium Risk (Requires careful import management)
- Cable tray constants (exported but concentrated in one file)
- Minimap constants (localized but affects UI layout)

### No Risk
- Edge drawing config (already exported and well-scoped)
- Tag relation parameters (localized utility)

---

## Benefits of Centralization

1. **Discoverability**: All tunable parameters visible in one file
2. **Consistency**: Related thresholds grouped logically
3. **Maintainability**: Changes to render/layout behavior are visible
4. **Documentation**: Can add comments explaining when to adjust each constant
5. **User Configuration**: Foundation for future settings panel
6. **Deduplication**: Eliminates 3 known duplicates

---

## Conclusion

The 338 SCREAMING_CASE constants are currently well-distributed:
- **281 file-local constants** are correctly kept with their implementations
- **57 exported constants** provide API surface
- **~99 constants should be centralized** for improved discoverability and maintainability

The recommended approach is to consolidate tunable thresholds and dimensions while leaving implementation-specific constants (colors, label geometry, algorithm internals) where they are.

**Estimated effort**: 2-3 hours of careful refactoring + 30 minutes of testing.

---

## Reference Files

All constants found are documented in this research file. To find specific constants:

```bash
# Find all SCREAMING_CASE constants (excluding constants.ts)
find src -type f -name "*.ts" ! -name "constants.ts" \
  -exec grep -H "const [A-Z][A-Z_0-9]\+ =" {} \;

# Search for specific constant usage
rg "CONSTANT_NAME" src/
```

