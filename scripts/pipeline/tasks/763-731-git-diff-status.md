---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 731-717-read-git-status
depends: subtask-1
summary: git diff で status 行のみの変更を検証
---

## Description (subtask of 731-717-read-git-status)

Bash で `git diff docs/issues/<対象ファイル>` を実行し、
  変更行が status 行1行のみ (`-status: ...` / `+status: done`) であることを確認する。
  他の行に一切差分がないことを確認。diff が期待通りでない場合は即座に失敗報告。
  検証のみで、add/commit/mv は実行しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
