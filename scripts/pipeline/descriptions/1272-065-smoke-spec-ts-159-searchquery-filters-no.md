## Description (subtask of 065-e2e-smoke-fail)

e2e/smoke.spec.ts:159 の `3-Filter › searchQuery filters nodes` 失敗を調査して修正する。
  手順:
  1. e2e/smoke.spec.ts の 159 行目周辺を読んで、どのクエリ文字列でフィルタし、フィルタ前後でどのノード数を比較しているかを特定する。
  2. 候補となる原因:
     - src/utils/query-expr.ts の parseQueryExpr / evaluateExpr の挙動変更 (field:value, OR/AND/XOR/NOR/NAND の処理)
     - getGraphData の searchQuery フィルタ段が抜けている / 順序が変わっている (MEMORY.md のフィルタリングパイプライン参照: 6番目に searchQuery フィルタ)
     - テスト側が期待するクエリ構文が暗黙 AND を仮定している (空白区切り = silent drop の仕様変更)
  3. CDP で実際にクエリを評価して、フィルタ後ノード数が 0 か変化なしかを切り分ける。
  4. 根因に応じて src/utils/query-expr.ts の parseQueryExpr / evaluateExpr もしくは src/views/GraphViewContainer.ts の getGraphData 内 searchQuery 適用箇所を修正する。
  5. ローカルで `pnpm test:e2e -- e2e/smoke.spec.ts -g "searchQuery filters nodes"` および `pnpm test -- query-expr` を実行して PASS を確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
