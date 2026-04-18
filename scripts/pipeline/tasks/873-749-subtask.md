---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 749-727-subtask
depends: none
summary: subtask
---

## Description (subtask of 749-727-subtask)

`★ Insight ─────────────────────────────────────`
このissueは「単一コミット」が明示的要件として指定されているため、複数subtaskへの分解は要件違反となります。1タスクに集約するのが正しい判断です。
ratchet downポリシーは CLAUDE.md の "Max Allowed" 数値を現在の実測値まで下げる一方向操作で、測定→更新→issue done→コミットを1セッションで完結させることで、測定値と記録値の乖離を防ぎます。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
