---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 972-956-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 972-956-639-626-subtask-issue-pending-done-git-m)

`★ Insight ─────────────────────────────────────`
- このissueは「単一コミット」制約があるため、本質的にアトミックな操作。過度な分解はコミット単位を壊す
- 先行issueの同種タスク（872-747, 984-865）は単一subtaskで処理されている履歴がある
- discovery（Glob）とexecution（git mv + commit）を別セッションに分けると状態引き継ぎが不安定
`─────────────────────────────────────────────────`

この issue は `git mv + frontmatter 1行書換 + 単一コミット` という**アトミック操作**なので、分解せず 1 subtask にまとめるのが適切です。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
