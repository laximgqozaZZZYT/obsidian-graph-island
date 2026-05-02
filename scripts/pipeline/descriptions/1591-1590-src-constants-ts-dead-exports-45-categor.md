## Description (subtask of 1590-dead-exports)

`node scripts/list-dead-exports.mjs` を実行し tmp/dead-exports-report.md を再生成する。
  同レポートの src/constants.ts に該当する行（現時点45件）について、
  Category C のシンボル（VIEW_MODE_GRAPH, VIEW_MODE_SUNBURST 等）は宣言ごと削除し、
  Category B のシンボルは `export` キーワードのみ削除して module-private に降格する。
  作業後に必ず `pnpm build` と `pnpm test` を通し、
  最後に `node scripts/list-dead-exports.mjs` を再実行して
  tmp/dead-exports-report.md の Total を 463 から減少させたことを確認する（具体数値は実測でコミットメッセージに記載）。
  src/constants.ts 以外のファイルは変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
