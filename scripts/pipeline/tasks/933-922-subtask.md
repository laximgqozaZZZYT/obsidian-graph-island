---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 922-898-760-730-status-result
depends: none
summary: subtask
---

## Description (subtask of 922-898-760-730-status-result)

`★ Insight ─────────────────────────────────────`
- このissueは既にかなり粒度が細かい「単一ファイル編集タスク」なので、過剰分解は避けて2サブタスクに留めるのが妥当です。
- Edit のアトミック性: frontmatter変更とチェックボックスreplace_allは同一Edit操作で安全、Result追記は別操作にするのがロールバック容易。
- 検証は「編集タスクの一部」に組み込むのがベター（独立サブタスクにすると pipeline が別セッションで Read し直す無駄が発生）。
`─────────────────────────────────────────────────`

以下、2サブタスクに分解します。

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
