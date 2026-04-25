
## Description (subtask of 142-coverage-drop)

`src/parsers/metadata-parser.ts` (buildGraphFromVault, tag 抽出, frontmatter パース), `src/i18n.ts` (t() の fallback パス, 未定義キー, ロケール切替) でカバーされていない分岐をテストする。
  - frontmatter 欠損, 型不一致, 配列/文字列の両対応
  - wikilink パース (alias, header, block reference)
  - i18n: 存在しないキー、nested key, プレースホルダー置換
  tests/__mocks__/obsidian.ts を利用し、純粋な入力→出力テストとして 10-15 件追加。
  完了基準: `pnpm test:coverage` が閾値をパス (statements ≥ 52.3%, functions ≥ 50.4%)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
