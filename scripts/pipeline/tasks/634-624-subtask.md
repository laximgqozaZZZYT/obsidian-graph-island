---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 624-607-4-god-object
depends: none
summary: subtask
---

## Description (subtask of 624-607-4-god-object)

`★ Insight ─────────────────────────────────────`
- このissueは read-only な計測タスクで、コード変更・テスト変更が発生しないため、通常の「パーサー→型→ロジック→UI→テスト」の分解は不要です
- God Object Policy は "ratchet down only" なので、現在値が上限を下回っていれば、それ自体が新しい上限（将来のratchet dowm候補）になります
- 4ファイルの計測は独立していますが、同一コマンドで一括実行可能なため分割する意味がなく、「計測」と「レポート化・違反判定」の2段階が自然な境界です
`─────────────────────────────────────────────────`

以下、2タスクに分解します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
