---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 760-730-git-status-short-modified
depends: none
summary: git status --short を実行し生出力を取得
---

## Description (subtask of 760-730-git-status-short-modified)

1. Bash tool で `git status --short` を実行 (cwd: /home/ubuntu/obsidian-plugins/obsidian-graph-island)
  2. stdout を変数に保持 (改行区切りの行リスト)
  3. exit code が 0 であることを確認。非0なら即エラー報告して終了
  4. git mv / git add / git commit は絶対に実行しない (read-only)
  5. 取得した生出力をサブタスク2に渡す

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
