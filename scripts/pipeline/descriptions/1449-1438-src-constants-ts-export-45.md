## Description (subtask of 1438-dead-exports)

`tmp/dead-exports-report.md` の Category C のうち `src/constants.ts` に列挙された 45 個の未使用 export を削除する。対象は VIEW_MODE_GRAPH 〜 VIEW_MODE_MATRIX (line 50–54)、NODE_DECO_BADGE_RADIUS_PX 〜 NODE_DECO_BOOKMARK_STAR_SPIKES (line 395–415)、OUTLINE_PAD_MIN 〜 ZOOM_OUT_THRESHOLD (line 466–510)、PATHFINDER_COLOR 〜 PATHFINDER_LABEL_FONT_SIZE (line 735–753) の各定数。
  手順:
  1. `node scripts/list-dead-exports.mjs` を再実行し最新の Category C 一覧を取得
  2. 各シンボルについて `Grep` で `src/`・`tests/` 全体を検索し、import / 参照が無いことを確認 (テスト参照があれば Category A になっているはず)
  3. 該当行を削除 (連続する `export const FOO = ...;` ブロックを除去、コメントも一緒に削除)
  4. `pnpm build` `pnpm lint` `pnpm test` `pnpm format:check` を全部通す
  5. コミットメッセージ例: `chore(constants): remove 45 unused exports identified by ts-prune`
  注意: `src/constants.ts` は God Object 対象外。`RenderThresholds` 経由で間接参照されている定数があれば残すこと。判断に迷う場合は削除せず unexport (`const` のみ) にとどめ、その旨をコミットメッセージに記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
