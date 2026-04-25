## Description (subtask of 145-coverage-drop)

1. `pnpm test:coverage` を実行し、`src/layouts/` および `src/parsers/` 配下でカバレッジ統計が低いファイルを特定する。
  2. 既存テストファイル（`tests/layouts/*.test.ts`, `tests/parsers/*.test.ts`）を確認し、未カバーの純粋関数を一覧化する。
  3. 一覧化した関数のうち、入出力が決定論的で副作用のないものに対し境界値テストを追加する（empty / 単一要素 / 重複 / 通常ケースを最低含める）。
  4. テストは既存の命名規則・スタイル（CLAUDE.md と既存 `*.test.ts` を参照）に従う。
  5. 関数本体は変更しない。export 追加が必要な場合のみ src 側に最小変更を加える。
  6. `pnpm test` パス + `pnpm test:coverage` でカバレッジ上昇を確認する。
  7. GOD OBJECT 4ファイルは対象外。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
