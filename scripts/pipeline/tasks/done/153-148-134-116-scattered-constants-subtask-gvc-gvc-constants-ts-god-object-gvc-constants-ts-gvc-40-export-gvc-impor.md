---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 148-134-116-scattered-constants-subtask-gvc-gvc-constants-ts-god-object
depends: none
summary: gvc-constants.ts新規作成＋GVC定数40個をexport移動＋GVC側import置換
---

## Description (subtask of 148-134-116-scattered-constants-subtask-gvc-gvc-constants-ts-god-object)

1. src/views/gvc-constants.ts を新規作成
  2. GVC L226-283 のトップレベル定数ブロック（約40個）を全て gvc-constants.ts に移動し export する
     - Timing: SAVE_DEBOUNCE_MS, ONBOARDING_HELP_DELAY_MS, ONBOARDING_HINT_DELAY_MS,
       HOVER_PREVIEW_DELAY_MS, AUTOFIT_DELAY_MS, ANIMATE_TO_NODE_MS, FADE_ALPHA_MS, SEARCH_PULSE_MS
     - Toast: TOAST_SHORT_MS, TOAST_LONG_MS
     - Cache: FM_KEYS_CACHE_TTL_MS
     - Thresholds: EXTREME_ZOOM_THRESHOLD, MOBILE_NODE_CAP, LARGE_GRAPH_LOCAL_THRESHOLD, TRANSITION_SKIP_THRESHOLD
     - Rendering: GOLDEN_RATIO_FALLBACK, BODY_PREVIEW_MAX_CHARS, COLLISION_RATE_OK, DIMMED_NODE_ALPHA,
       SEARCH_HALO_STROKE_WIDTH, SEARCH_HALO_STROKE_ALPHA, HOVER_TOOLTIP_BG_ALPHA, SEARCH_PULSE_SCALE,
       ALPHA_EPSILON, ARC_ANGLE_EPSILON, HEATMAP_MIN_VALUE, ZOOM_TO_LABEL_RECT
     - Ring: RING_FILL_ALPHA_FLOOR, RING_FILL_ALPHA_BASE, RING_FILL_ALPHA_DEPTH_DECAY
     - Link preview: LINK_PREVIEW_COLOR, LINK_PREVIEW_DASH, LINK_PREVIEW_LINE_WIDTH, LINK_PREVIEW_LINE_ALPHA,
       LINK_PREVIEW_SNAP_LINE_WIDTH, LINK_PREVIEW_SNAP_ALPHA, LINK_PREVIEW_SNAP_RADIUS
     - Sunburst: SUNBURST_FILL_ALPHA_FLOOR, SUNBURST_FILL_ALPHA_BASE, SUNBURST_FILL_ALPHA_DEPTH_DECAY,
       SUNBURST_STROKE_ALPHA_FLOOR, SUNBURST_STROKE_ALPHA_BASE, SUNBURST_STROKE_ALPHA_DEPTH_DECAY
     - Canvas: DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT
  3. GVC L941 の ONBOARDING_KEY, L6317 の MAX_THUMBNAILS もインラインから gvc-constants.ts に移動
  4. GVC側に import { ... } from "./gvc-constants" を追加し、元の定数宣言を削除
  5. GVC の行数が定数ブロック分（約65行）減ることを確認
  6. pnpm build && pnpm test && pnpm lint で全パス確認
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
