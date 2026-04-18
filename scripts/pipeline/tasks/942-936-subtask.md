---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 936-924-639-626-subtask-issue-frontmatter-status
depends: none
summary: subtask
---

## Description (subtask of 936-924-639-626-subtask-issue-frontmatter-status)

`★ Insight ─────────────────────────────────────`
- 元issueの★Insightが既に指摘している通り、このタスクは本質的にアトミック(Glob→Read→Edit→commit の4ツール呼び出し)で、分割するとセッション跨ぎのオーバーヘッドが逆に増える
- `issues/` ディレクトリ配下の frontmatter `status` フィールド運用は、自律パイプラインの状態機械(pending/in-progress/done)そのもの。1行変更でも `git diff` で可視化されるため、追跡可能性が保たれる
- 分解ルール5「最大5タスク」は上限であって下限ではない。1タスクで完結する作業を無理に分けない判断が品質ゲート
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
