---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 752-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 752-712-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- この issue は「ファイル1つを pending→done に移動 + frontmatter 1行書換 + コミット」という**原子的な1オペレーション**なので、分解しても価値が薄い
- `git mv` は pending 側を削除 + done 側を追加する1コマンドで原子性を保つため、Edit と mv を別サブタスクに分けるとステージング状態の引き渡しが面倒になる
- 「done 化コミット」系タスクは分解せず1タスクで完結させるのが自律パイプライン運用上も安全（中間状態コミットを避ける）
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
