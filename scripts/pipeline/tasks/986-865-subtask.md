---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 865-744-git-mv-pending-done
depends: none
summary: subtask
---

## Description (subtask of 865-744-git-mv-pending-done)

の staging 状態 (`R  issues/pending/<basename>.md -> issues/done/<basename>.md` 1 行のみ) を再確認。
  2. `git commit -m "chore: done <basename> — GVC test report appended"` を 1 行メッセージで実行 (heredoc 不使用、`--no-verify` 不使用、`Co-Authored-By` 行不要)。
  3. 検証 (全て成功すること):
     - `git status` がクリーン (nothing to commit, working tree clean)
     - `git log -1 --pretty=%s` が `chore: done <basename> — GVC test report appended` と完全一致
     - `ls issues/done/<basename>.md` が存在
     - `ls issues/pending/<basename>.md` が不在 (`ls: cannot access ...: No such file or directory`)
  4. 失敗時: `git reset HEAD~1 --mixed` は絶対に実行せず、`git status` と `git log -1` の出力をユーザーに報告して停止。
  5. push は実行しない (ユーザーの明示的依頼があるまで禁止)。
  6. lint/test/build は実行しない (CLAUDE.md 品質ゲート対象外のファイル移動のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
