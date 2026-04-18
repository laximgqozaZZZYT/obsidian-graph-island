---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 811-802-git-status-short-tmp-git-status-short-tx
depends: none
summary: subtask
---

## Description (subtask of 811-802-git-status-short-tmp-git-status-short-tx)

`★ Insight ─────────────────────────────────────`
- このタスクは既にアトミック (単一コマンド実行 + 検証) なので、これ以上の分解は不要。無理に分割すると claude -p セッションのオーバーヘッドが増えるだけ。
- `git status --short` は read-only 操作で、CLAUDE.md の「destructive git commands 禁止」ルールにも合致。`/tmp/` への出力なので worktree も汚さない。
- Acceptance criteria 3項目すべてが同一セッションで即検証可能 (exit code / ファイル存在 / wc -l)。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
