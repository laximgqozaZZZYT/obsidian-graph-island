---
priority: high
reported: 2026-04-15
status: pending
source: decomposed
parent: 134-116-scattered-constants-subtask
depends: none
summary: GVCトップレベル定数をgvc-constants.tsに抽出（God Object削減）
---

## Description (subtask of 134-116-scattered-constants-subtask)

GraphViewContainer.ts L226-283 のトップレベル定数（約40個）を
  新ファイル src/views/gvc-constants.ts に抽出する。
  
  対象: SAVE_DEBOUNCE_MS, ONBOARDING_HELP_DELAY_MS, HOVER_PREVIEW_DELAY_MS,
  AUTOFIT_DELAY_MS, ANIMATE_TO_NODE_MS, FADE_ALPHA_MS, SEARCH_PULSE_MS,
  TOAST_LONG_MS, FM_KEYS_CACHE_TTL_MS, EXTREME_ZOOM_THRESHOLD,
  MOBILE_NODE_CAP, LARGE_GRAPH_LOCAL_THRESHOLD, TRANSITION_SKIP_THRESHOLD,
  GOLDEN_RATIO_FALLBACK, BODY_PREVIEW_MAX_CHARS, COLLISION_RATE_OK,
  DIMMED_NODE_ALPHA, SEARCH_HALO_*, HOVER_TOOLTIP_BG_ALPHA,
  SEARCH_PULSE_SCALE, ALPHA_EPSILON, ARC_ANGLE_EPSILON, HEATMAP_MIN_VALUE,
  ZOOM_TO_LABEL_RECT, RING_FILL_ALPHA_*, LINK_PREVIEW_*,
  SUNBURST_FILL_ALPHA_*, SUNBURST_STROKE_ALPHA_*,
  DEFAULT_CANVAS_WIDTH/HEIGHT
  
  GVC内のインライン定数（L941 ONBOARDING_KEY, L6317 MAX_THUMBNAILS等）も
  同ファイルに移動する。VIEW_TYPE_GRAPH は既に export されているため
  constants.ts に移動を検討。
  
  GVC側は import { ... } from "./gvc-constants" に置換。
  既存テストへの影響なし（これらは非exportのファイルローカル定数のため）。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
