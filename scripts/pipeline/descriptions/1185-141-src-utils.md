
## Description (subtask of 141-coverage-drop)

`pnpm test:coverage` を実行し、カバレッジレポートから src/utils/ 配下で
  statements/functions カバレッジが 40% 未満の純粋関数を 3〜5 個特定する。
  対応する tests/utils/ 配下にテストファイルを新規作成または追記し、
  境界値・エッジケースを含むユニットテストを 10〜20 件追加する。
  対象候補: query-expr.ts の未カバー分岐 (fuzzy/wildcard/ネスト), string utilities,
  数値変換系 helper。God Object (GraphViewContainer.ts 等) のテストは禁止。
  コミット前に `pnpm test` で全件 PASS を確認すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
