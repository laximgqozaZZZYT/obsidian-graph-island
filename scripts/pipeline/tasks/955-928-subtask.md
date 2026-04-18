---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 928-911-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 928-911-639-626-subtask-issue-pending-done-git-m)

元issueが既に1セッション完結粒度のため、単一SUBTASKとして出力します。親タスク `928-911-...md` の手順に従い、`issues/pending/*639-626*subtask*.md` を `issues/done/` へ `git mv` + `status: done` 書換 + 単一コミット。

## Acceptance criteria
- [ ] 対象ファイルが issues/done/ 配下に存在し `status: done` となっていること
- [ ] `git status` clean かつコミット 1 件で完了していること
- [ ] CLAUDE.md のルールに違反しないこと
