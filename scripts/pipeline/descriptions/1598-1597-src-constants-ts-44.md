## Description (subtask of 1597-dead-exports)

`node scripts/list-dead-exports.mjs` の Category C で `src/constants.ts` に
  該当する以下 44 シンボルを削除する (export 解除ではなく、参照が完全に
  ゼロのため削除)。

  対象シンボル (line 番号は 2026-04-30 時点の tmp/dead-exports-report.md より):
  - VIEW_MODE_GRAPH / SUNBURST / TIMELINE / TREE / MATRIX (50-54)
  - NODE_DECO_BADGE_RADIUS_PX / MAX_COUNT / PAD_FACTOR / RING_WIDTH /
    RING_PAD / RING_ALPHA / DASH_SEGMENTS / DASH_GAP_FRACTION /
    HALO_ALPHA_BASE / HALO_ALPHA_FACTOR / BOOKMARK_STAR_SPIKES (395-415)
  - OUTLINE_PAD_MIN / OUTLINE_PAD_FACTOR / HULL_SAMPLES /
    OVERLAP_RECOMPUTE_FRAMES / SIZE_FADE_DIVISOR / FILL_ALPHA_BASE /
    FILL_ALPHA_OVERLAP / LABEL_COLLISION_MAX_ATTEMPTS /
    STROKE_ALPHA_NO_OVERLAP / STROKE_ALPHA_OVERLAP_MIN /
    STROKE_ALPHA_OVERLAP_BASE / STROKE_WIDTH_NO_OVERLAP /
    STROKE_WIDTH_OVERLAP_BASE / STROKE_WIDTH_OVERLAP_MIN /
    BORDER_OUTER_WIDTH / BORDER_OUTER_ALPHA_FACTOR / SIZE_FADE_MIN /
    FILL_ALPHA_VISIBILITY_THRESHOLD / LABEL_DARKEN_FACTOR /
    LABEL_PILL_PAD_X / LABEL_PILL_PAD_Y / COLLISION_ESCAPE_MARGIN /
    ZOOM_OUT_THRESHOLD (466-510)
  - PATHFINDER_COLOR / COLOR_CSS / GLOW_STROKE_WIDTH /
    SOLID_STROKE_WIDTH / DOT_RADIUS / LABEL_FONT_SIZE (735-753)

  手順:
  1. 各シンボルについて `grep -rn "<NAME>" src/ tests/` で参照ゼロを再確認
     (ts-prune は型/メンバー混同で誤判定する可能性があるため必ず再確認)
  2. 参照ゼロのもののみ削除。何かに参照があれば残し、その旨をコミット
     メッセージで報告
  3. `pnpm build && pnpm test && pnpm lint && node scripts/check-dead-exports.mjs`
     をすべて green にしてコミット

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
