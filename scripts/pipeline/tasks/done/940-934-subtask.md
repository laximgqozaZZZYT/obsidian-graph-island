---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 934-922-760-730-frontmatter-status-acceptance
depends: none
summary: subtask
---

## Description (subtask of 934-922-760-730-frontmatter-status-acceptance)

`★ Insight ─────────────────────────────────────`
- この issue は1ファイル (tasks/760-730-git-status-short-modified.md) への逐次的な編集のみで、分解する価値が薄い。4ステップが全て同一ファイル・同一ツールセッションで完結する
- 分解ルール「独立して実装・テスト・コミットできる」に照らすと、frontmatter変更とチェックボックス更新を分けても両方が同じファイルを触るため衝突する。1タスクに集約するのが妥当
- parent 922-898-760-730-status-result はメタタスク (ステータス整合性維持) なので、子タスクは機械的な編集作業1つで十分
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
