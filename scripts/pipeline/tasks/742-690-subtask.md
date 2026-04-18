---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 690-687-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 690-687-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- 既存の自律パイプライン (`project_autonomous_pipeline.md`) は `issues/pending/` → `issues/done/` の git mv パターンを採用しており、タスク分解もこのステップを中断なく完了させる粒度で設計するのが肝。
- 元issueは7ステップだが、claude -p の max-turns 30 制約下では「検索+frontmatter編集」「git mv+commit+検証」の2フェーズに集約した方が状態の引き継ぎミスを避けられる。
- `depends` 連鎖で各サブタスクの順序を明示することで、パイプラインが1つのサブタスクで失敗した場合に後続を自動スキップできる。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
