## Description (subtask of 065-e2e-smoke-fail)

e2e/smoke.spec.ts:159 周辺の "3-Filter › searchQuery filters nodes" テストを読み、
  どの searchQuery 文字列を投入してどの件数を期待しているかを特定する。
  query-expr.ts (parseQueryExpr / evaluateExpr) と getGraphData の searchQuery
  ステップ (memory: 「6. searchQuery filter」) を読み、フィルタ後の nodeSet が
  テスト期待値とずれている原因を確定して修正する。
  - field:value / OR / AND のパース結果が rawData の field と一致しているかを確認
  - 暗黙 AND を導入しない (memory: 空白区切りは silently drop が現仕様)
  テスト本体 (smoke.spec.ts) の期待値は変更しない。
  GraphViewContainer.ts は GOD OBJECT のため、ロジック追加は禁止。
  query-expr.ts 側で完結させること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
