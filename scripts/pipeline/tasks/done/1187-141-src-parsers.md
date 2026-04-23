---
priority: high
reported: 2026-04-24
status: blocked
source: decomposed
parent: 141-coverage-drop
depends: none
summary: src/parsers/ の境界値・異常系テスト追加
---

## Description (subtask of 141-coverage-drop)

src/parsers/metadata-parser.ts と src/parsers/ 配下の他ファイルについて
  カバレッジレポートで未カバーの分岐を特定し、
  以下のようなケースのテストを 10〜15 件追加する:
  - frontmatter が null / undefined / 空オブジェクト
  - wikilink パースの特殊文字 (`|`, `#`, `^`)
  - 不正な node_type / tags / related 値
  - 循環参照・重複エッジ
  src/ のロジックは変更せず、tests/parsers/ への追加のみ。
  `pnpm test` で全件 PASS 確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

## Blocker
自律パイプラインの実行枠内でタイムアウト (commit 52f6abf5)。再開条件: 次サイクルで
未カバー分岐の特定から再着手 (`pnpm test:coverage -- --reporter=verbose src/parsers/`)、
1 バッチあたり 3〜5 ケースに絞って時間内に収める。
