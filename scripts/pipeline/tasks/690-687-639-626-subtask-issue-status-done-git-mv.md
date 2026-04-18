---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 687-678-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issueをstatus:done化してgit mvコミット
---

## Description (subtask of 687-678-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定。
     - 0件なら Glob `issues/done/*639-626*subtask*.md` で done済み確認 → あれば no-op 終了。
     - frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系のものを採用。
  2. Read で対象ファイル全体を取得し、Edit で frontmatter の `status: decomposed`(または `in-progress`) を `status: done` に変更。他フィールド (priority/reported/parent/depends/summary/source) と本文は一切触らない。
  3. `git mv issues/pending/<basename>.md issues/done/<basename>.md` を実行。
  4. `git status` の差分が「pending側delete + done側add + status行modify」のみであることを確認。src/** やテスト・設定ファイルは変更しない。
  5. `git add issues/pending/<basename>.md issues/done/<basename>.md && git commit -m "chore: done <basename> — GVC test report appended"` でコミット (`<basename>` は拡張子なし)。
  6. 検証: `git status` がクリーン、`git log -1 --pretty=%s` がコミットメッセージに一致、`ls issues/done/<basename>.md` が存在。
  7. lint/test/build は実行しない。

## Acceptance criteria
- [ ] `issues/done/<basename>.md` が存在し frontmatter `status: done`
- [ ] `git status` クリーンで新規コミット1件のみ
- [ ] CLAUDE.md のルールに違反しないこと
