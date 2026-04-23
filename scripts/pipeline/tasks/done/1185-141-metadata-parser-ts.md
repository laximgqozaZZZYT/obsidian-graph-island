---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 141-coverage-drop
depends: none
summary: metadata-parser.ts の未カバー分岐にテスト追加
---

## Description (subtask of 141-coverage-drop)

`src/parsers/metadata-parser.ts` は 412 stmts/49 fns で 29.4% stmts / 44.9% fns とギャップが大きい。
  新規テストファイル `tests/metadata-parser-edge.test.ts` を作成し、以下の境界ケースを追加する。
  - frontmatter 欠損／不正YAML／null値のパース
  - `node_type`, `prop-category`, `story_order`, `start-date` 各フィールドの型ゆれ (string/number/array)
  - `related` wikilink の形式バリエーション (`[[A]]`, `[[A|alias]]`, `[[A#heading]]`, 自己参照, 循環)
  - tags 配列／文字列両形式
  - has-tag エッジ生成と tag ノード生成の境界
  モックは `tests/__mocks__/obsidian.ts` を使う。既存フィクスチャ流用可。最低20ケース追加を目標。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
