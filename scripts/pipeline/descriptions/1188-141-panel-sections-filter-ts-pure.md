
## Description (subtask of 141-coverage-drop)

`src/views/panel-sections-filter.ts` は 342 stmts/101 fns で 41.8% stmts / 25.7% fns。
  関数数が多い割に fns カバレッジが低い＝**小さな pure フィルタ関数が未テスト**。
  新規 `tests/panel-sections-filter.test.ts` で export 済みフィルタ関数を
  20件以上カバー。各関数について空入力・単一要素・複数要素・重複・境界値の4パターンを基本とする。
  DOM生成関数（非 pure）は対象外、セレクタ・条件判定などの pure 関数に集中する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
