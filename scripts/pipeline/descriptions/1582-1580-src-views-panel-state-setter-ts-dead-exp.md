## Description (subtask of 1580-dead-exports)

`tmp/dead-exports-report.md` から `src/views/panel-state-setter.ts` の
  Category B (16 件) / Category C (26 件) を対象とする。
  作業手順:
  1. `pnpm test` でベースライン確認。
  2. レポートから panel-state-setter.ts のシンボル一覧を抽出。
  3. 各シンボルを `grep -rn "シンボル名" src/ tests/` で参照を再検証。
  4. Category C のシンボル: 宣言を削除。
  5. Category B のシンボル: `export` キーワードのみ削除し、ローカル化。
  6. `pnpm build && pnpm test && pnpm lint` 全てグリーン。
  7. `node scripts/list-dead-exports.mjs` を再実行し、panel-state-setter.ts のエントリが大幅に減ったことを確認。
  禁止事項: setter 関数のシグネチャ変更、状態管理ロジックへの介入。`export` 削除と完全未使用シンボルの削除のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
