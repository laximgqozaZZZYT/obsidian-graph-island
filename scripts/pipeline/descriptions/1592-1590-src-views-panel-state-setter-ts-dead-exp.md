## Description (subtask of 1590-dead-exports)

最新の tmp/dead-exports-report.md（subtask-1 完了後の状態）に基づき、
  src/views/panel-state-setter.ts の Category C 26件（asAnalysisOverlay, asCableBundleMode 等の as*** ヘルパー、
  setEdgeTypeFlag, getEdgeTypeFlag, asHoverEdgeTypeKey 等）は宣言ごと削除し、
  Category B 16件は `export` キーワードのみ削除する。
  panel-state-setter.ts 以外のソースファイルを変更してはならない。
  作業後に `pnpm build` と `pnpm test` を通し、
  `node scripts/list-dead-exports.mjs` を再実行して Total を再度減少させたことを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
