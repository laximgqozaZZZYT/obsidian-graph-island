## Description (subtask of 1672-dead-exports)

`tmp/dead-exports-report.md` Category C の `src/constants.ts` 行で挙がっている未使用 export を削除する。具体的な対象 (行番号は report 時点):
  - VIEW_MODE_GRAPH / VIEW_MODE_SUNBURST / VIEW_MODE_TIMELINE / VIEW_MODE_TREE / VIEW_MODE_MATRIX (lines 50-54)
  - NODE_DECO_BADGE_RADIUS_PX / NODE_DECO_BADGE_MAX_COUNT / NODE_DECO_BADGE_PAD_FACTOR / NODE_DECO_RING_WIDTH / NODE_DECO_RING_PAD / NODE_DECO_RING_ALPHA / NODE_DECO_DASH_SEGMENTS / NODE_DECO_DASH_GAP_FRACTION / NODE_DECO_HALO_ALPHA_BASE / NODE_DECO_HALO_ALPHA_FACTOR / NODE_DECO_BOOKMARK_STAR_SPIKES (lines 395-415)
  - OUTLINE_PAD_MIN / OUTLINE_PAD_FACTOR / HULL_SAMPLES / OVERLAP_RECOMPUTE_FRAMES / SIZE_FADE_DIVISOR / FILL_ALPHA_BASE / FILL_ALPHA_OVERLAP / LABEL_COLLISION_MAX_ATTEMPTS / STROKE_ALPHA_NO_OVERLAP / STROKE_ALPHA_OVERLAP_MIN / STROKE_ALPHA_OVERLAP_BASE / STROKE_WIDTH_NO_OVERLAP / STROKE_WIDTH_OVERLAP_BASE / STROKE_WIDTH_OVERLAP_MIN / BORDER_OUTER_WIDTH / BORDER_OUTER_ALPHA_FACTOR / SIZE_FADE_MIN / FILL_ALPHA_VISIBILITY_THRESHOLD / LABEL_DARKEN_FACTOR / LABEL_PILL_PAD_X / LABEL_PILL_PAD_Y / COLLISION_ESCAPE_MARGIN / ZOOM_OUT_THRESHOLD (lines 466-510)
  - PATHFINDER_COLOR / PATHFINDER_COLOR_CSS / PATHFINDER_GLOW_STROKE_WIDTH / PATHFINDER_SOLID_STROKE_WIDTH / PATHFINDER_DOT_RADIUS / PATHFINDER_LABEL_FONT_SIZE (lines 735-753)
  
  手順:
  1. 削除前に各シンボルを `grep -rn "<NAME>" src/ tests/` で再確認 (report 時点と現状のズレを検出)。tests/ で参照があれば Category C 判定が誤りなので削除しない。
  2. 関連コメントブロックも一緒に削除し、孤立した空行・空のコメントセクションを掃除する。
  3. `pnpm test` / `pnpm lint` / `pnpm build` を通す。
  4. `node scripts/list-dead-exports.mjs` 再生成して件数減を確認 (commit message に before/after の total を記載)。
  
  Forbidden Patterns 順守: しきい値・マジックナンバーを別ファイルへ移すのではなく削除のみ。`RenderThresholds` 経由の参照に置き換える必要が出たら、それは Category C ではない (= 報告誤り) ので対象外として残す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
