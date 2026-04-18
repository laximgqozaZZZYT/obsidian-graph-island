---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 897-887-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 897-887-639-626-subtask-issue-pending-done-git-m)

`★ Insight ─────────────────────────────────────`
- この issue は既に「原子的 rename + 1 行書換 + 1 コミット」という最小単位まで分解済み。さらに割ると git の原子性（rename と status 変更を 1 コミットに含める制約）を壊すため、単一 SUBTASK が最適。
- `git mv` は内部的に delete + add を 1 オペレーションで記録するが、frontmatter を同時に書換えた場合は similarity index が下がり rename 検出が外れる可能性がある。検証ステップ 4 がその保険。
`─────────────────────────────────────────────────`

この issue は既に単一セッション完結サイズまで分解されているため、1 SUBTASK として出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
