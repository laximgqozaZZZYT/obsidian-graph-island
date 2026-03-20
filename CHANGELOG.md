# Changelog

All notable changes to Graph Island are documented here.

## [Unreleased] — Quality & UX Improvements (Cycles 1-17)

### Added
- **Onboarding**: First-launch help overlay showing keyboard shortcuts and thinking modes
- **Node icon prefix** (A3): `nodeIconField`/`nodeIconMap` — prepend emoji/text icons to node labels based on frontmatter values
- **LOD 4+ sub-labels**: Auto-show metadata sub-labels at medium zoom when autoLOD is active
- **Alt+Click pathfinder** (B2): Click two nodes to highlight shortest path (1st=start, 2nd=end, 3rd=reset)
- **Edge distance alpha**: Edges near hovered node are brighter, distant edges fade
- **Cluster health score**: Super node tooltips show internal edge density percentage
- **Degree distribution chart**: Mini histogram in graph statistics panel
- **Pinned node visual indicator**: Ring overlay for pinned/held nodes
- **Viewport bookmarks**: Save and restore named viewport positions
- **Nodes tab**: Directory tree with visibility toggle and link highlighting
- **Complexity score**: Node complexity metric in tooltips
- **Search pulse**: Brief scale animation on first search highlight match
- **Ego arrangement**: New cluster arrangement pattern (polar/radial ego-centric)
- **Context help**: All 25 panel sections have `?` help popups (EN + JP)
- **Settings search**: Filter all settings across tabs by keyword
- **Thinking mode presets**: Explore/Analyze/Write modes with directional gravity

### Changed
- **Collision padding**: 8→12px (regular), 16→20px (super nodes) for less overlap
- **forceCollide iterations**: 4→8 for stronger overlap resolution
- **Label spacing**: p70→p90 percentile for better large-label coverage
- **DEFERRED_BATCH_SIZE**: 100→200 for faster initial rendering (917 nodes/sec)
- **Ring snap**: Hard snap→damped blend (0.85) to eliminate concentric layout jitter
- **Label displacement**: Adaptive direction scoring (farthest-from-placed-first)
- **Rotary label culling**: O(n²)→O(n×k) via spatial hash grid with priority sort
- **Auto-bundle strength**: Now used as fallback when user edgeBundleStrength is 0
- **UI sections**: Cable Bundle and Road Network default to collapsed
- **Help overlay**: Theme-aware colors via CSS variables (dark/light mode)
- **README**: Updated with thinking modes, analysis overlays, display modes

### Fixed
- **63 TypeScript errors → 0**: GraphNode type extensions, PanelState casts, localGraphCenter sentinel, ego arrangement registration, and more
- **Label overlap**: `_sacrificeSuperLabels` fallback now checks grid before placing
- **Ghost UI**: Removed `showOntologyBackbone` duplicate toggle, `gapDetectionMode` dropdown
- **Progressive disclosure**: `focusConeEnabled` hidden when focusMode is OFF
- **collapsedMembers type**: Fixed `string[]` type mismatch in tooltip rendering
- **scale.set()**: Fixed single-arg API call for CanvasContainer

### Refactored
- **THINKING_MODE_PRESETS**: Extracted shared preset constant (2 locations → 1)
- **Magic numbers**: 18 sites converted to named constants (DEFAULT_CANVAS_WIDTH/HEIGHT, INITIAL_SCATTER_X/Y)
- **Preset callbacks**: Deduplicated getNodeTreeData/getForwardLinks/getBacklinks via private methods

### Performance
- Full render: 2271 nodes + 11074 edges in **2477ms** (917 nodes/sec)
- Arrangement switch: ~1250ms per layout change
- Search filter: 2000ms for full-vault filter
- E2E test suite: 43 tests in **3.1 minutes**

### Test Coverage
- Unit tests: **585** (vitest)
- E2E tests: **43** (Playwright CDP)
- TypeScript: **0 errors** (strict mode)
