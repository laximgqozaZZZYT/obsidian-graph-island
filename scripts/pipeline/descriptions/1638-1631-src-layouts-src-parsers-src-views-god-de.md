## Description (subtask of 1631-dead-exports)

subtask-1 で更新した ts-prune 一覧から、src/layouts/, src/parsers/, src/views/ (ただし
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は除外) の
  dead exports を対象に、削除または `export` 除去を行う。
  特に layout 関数の純粋関数 export は他レイアウトから参照されている可能性があるため、
  Grep で参照ゼロを確認した上で処理する。
  CLAUDE.md の god object policy に従い、対象4ファイルは触らない (行数を増減させない)。
  完了後 `pnpm test` `pnpm lint` `pnpm build` を実行し、ts-prune の残件数を記録。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
