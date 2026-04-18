---
priority: low
reported: 2026-04-19
status: pending
source: decomposed
parent: 941-934-760-730-status-done-acceptance
depends: subtask-1
summary: 変更を git status で1ファイル限定確認しコミット
---

## Description (subtask of 941-934-760-730-status-done-acceptance)

手順:
  1. `git status --short` で変更されているのが tasks/760-730-git-status-short-modified.md の1ファイルのみであることを確認
  2. 他のファイルに変更がある場合は即座に中断してユーザーに報告 (勝手に stash や reset しない)
  3. 1ファイル限定が確認できたら `git add tasks/760-730-git-status-short-modified.md` してコミット
  4. コミットメッセージ: `chore: done 760-730-git-status-short-modified.md` (既存のコミット履歴 `chore: done 843-728-edit-status-decomposed-status-done.md` のスタイルに合わせる)
  5. コミット後 `git status` で clean 状態を確認

  注意:
  - `git add -A` や `git add .` 禁止 (指定ファイルのみ add)
  - push は不要 (コミットのみ)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
