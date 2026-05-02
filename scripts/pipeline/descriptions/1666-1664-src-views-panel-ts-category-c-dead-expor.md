## Description (subtask of 1664-dead-exports)

scripts/list-dead-exports.mjs を実行して、Category C のうち以下4ファイル合計51件
  の export を削除する:
  - src/views/panel-state-setter.ts (26件)
  - src/views/panel-sections-filter-logic.ts (13件)
  - src/views/panel-sections-filter.ts (6件)
  - src/views/panel-sections-layout.ts (6件)
  手順:
  1. 各シンボルを `grep -r "シンボル名" src/ tests/` で参照ゼロを確認
  2. 参照ゼロなら宣言ごと削除（同モジュール内で使われている場合は `export` のみ外す）
  3. PanelBuilder.ts (God Object) は触らない — このタスクで肥大化させない
  4. `pnpm build` `pnpm test` `pnpm lint` を実行
  5. `node scripts/list-dead-exports.mjs` で件数減少を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
