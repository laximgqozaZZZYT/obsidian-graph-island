---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 758-730-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 758-730-status-done-edit)

`★ Insight ─────────────────────────────────────`
- このissueは親タスク `730-717-status-done-edit` のsubtask-2に相当し、単一責務（Edit置換のみ）に絞られています
- git操作を除外しているのは、後続タスクが責任を持つことでロールバック単位を明確にするため
- `old_string` に周囲行を含めるのは、frontmatter中に `status:` が複数回現れるケース（例: tags内やコメント内）での誤置換を防ぐ設計
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
