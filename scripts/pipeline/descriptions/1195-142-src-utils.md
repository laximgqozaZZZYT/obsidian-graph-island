
## Description (subtask of 142-coverage-drop)

`pnpm test:coverage` を実行し、`src/utils/` 配下でカバレッジが低い(function coverage < 60%) ファイルを 2-3 個特定する。
  候補: query-expr.ts の未カバー分岐、graph-filter.ts の境界値、その他の純粋関数 (string utilities, array helpers 等)。
  特定したファイルに対し、tests/utils/ 配下に対応するテストを追加する (合計 15-25 件)。
  - 境界値 (empty, single, duplicate, self-reference)
  - エラーパス (invalid input, missing fields)
  - 既存テストと重複しないケース
  新規ファイル作成のみ。既存 src/ コードは変更しない。
  完了基準: `pnpm test` 全 PASS、statements/functions カバレッジが +0.3% 以上上昇。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
