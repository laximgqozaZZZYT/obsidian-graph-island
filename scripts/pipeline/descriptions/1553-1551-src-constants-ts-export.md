## Description (subtask of 1551-dead-exports)

`tmp/dead-exports-report.md` の Category C のうち `src/constants.ts` に属する
  約 45 個の未使用 export 定数を削除する。対象例:
  VIEW_MODE_GRAPH / VIEW_MODE_SUNBURST / VIEW_MODE_TIMELINE / VIEW_MODE_TREE / VIEW_MODE_MATRIX,
  NODE_DECO_BADGE_RADIUS_PX 系 (radius/max_count/pad_factor),
  NODE_DECO_RING_* 系 (width/pad/alpha),
  NODE_DECO_DASH_* 系, NODE_DECO_HALO_ALPHA_*, NODE_DECO_BOOKMARK_STAR_SPIKES,
  OUTLINE_PAD_MIN/FACTOR, HULL_SAMPLES, OVERLAP_RECOMPUTE_FRAMES,
  SIZE_FADE_DIVISOR/MIN, FILL_ALPHA_BASE/OVERLAP/VISIBILITY_THRESHOLD,
  LABEL_COLLISION_MAX_ATTEMPTS, STROKE_ALPHA_*, STROKE_WIDTH_*,
  BORDER_OUTER_*, LABEL_DARKEN_FACTOR, LABEL_PILL_PAD_X/Y,
  COLLISION_ESCAPE_MARGIN, ZOOM_OUT_THRESHOLD,
  PATHFINDER_COLOR / PATHFINDER_COLOR_CSS / PATHFINDER_GLOW_STROKE_WIDTH /
  PATHFINDER_SOLID_STROKE_WIDTH / PATHFINDER_DOT_RADIUS / PATHFINDER_LABEL_FONT_SIZE。
  
  手順:
  1. `node scripts/list-dead-exports.mjs` を再実行して Category C の最新一覧を取得
  2. 各シンボルについて `grep -n` で参照を確認 (一致が宣言行のみなら削除対象)
  3. 削除後、`pnpm lint` / `pnpm test` / `pnpm build` を通す
  4. Forbidden Pattern (RenderThresholds 経由ハードコード化など) を引き起こさない
     ことを確認 — 削除のみ。新たな magic number を撒かない
  5. GOD OBJECT 4ファイル (`GraphViewContainer.ts` 等) には触らない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
