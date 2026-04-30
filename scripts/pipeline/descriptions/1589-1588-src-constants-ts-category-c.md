## Description (subtask of 1588-dead-exports)

`tmp/dead-exports-report.md` の Category C 中、`src/constants.ts` 配下のエントリを削除する。
  対象は VIEW_MODE_GRAPH/SUNBURST/TIMELINE/TREE/MATRIX、NODE_DECO_BADGE_*、NODE_DECO_RING_*、
  NODE_DECO_DASH_*、NODE_DECO_HALO_*、NODE_DECO_BOOKMARK_STAR_SPIKES、OUTLINE_PAD_MIN/FACTOR、
  HULL_SAMPLES、OVERLAP_RECOMPUTE_FRAMES、SIZE_FADE_DIVISOR、FILL_ALPHA_*、
  LABEL_COLLISION_MAX_ATTEMPTS、STROKE_ALPHA_*、STROKE_WIDTH_* 等の Category C エントリ全件。

  手順:
  1. `node scripts/list-dead-exports.mjs` を実行し最新の `tmp/dead-exports-report.md` を再生成
  2. Category C の `src/constants.ts` 行を全て抽出
  3. 各 symbol について `grep -r "<symbol>" src/ tests/` でテスト参照を再確認
     - tests から参照されているものは Category A に格上げすべき(レポートの誤分類があり得る) → 残す
     - 完全に未参照 → `export const <symbol> = ...` を削除
  4. `pnpm build` と `pnpm test` を実行して回帰がないことを確認
  5. 削除後 `node scripts/list-dead-exports.mjs` で再計測しコミット
  6. RenderThresholds 経由でアクセスされている定数は外見的に未使用に見えても残す(設定経由参照のため)

  禁止事項:
  - Category A/B のエントリには手をつけない(B は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
