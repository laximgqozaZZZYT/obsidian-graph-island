---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 690-687-639-626-subtask-issue-status-done-git-mv
depends: subtask-1
summary: git mvで対象ファイルをpending→doneに移動しコミット
---

## Description (subtask of 690-687-639-626-subtask-issue-status-done-git-mv)

1. `git mv issues/pending/<basename>.md issues/done/<basename>.md` を実行
  2. `git status` で差分が「pending側delete + done側add + status行modify」のみであることを確認
  3. src/** やテスト・設定ファイルが変更されていないこと確認 (あればsubtaskを中止)
  4. `git add issues/pending/<basename>.md issues/done/<basename>.md && git commit -m "chore: done <basename> — GVC test report appended"` でコミット
  5. 検証: `git status` がクリーン、`git log -1 --pretty=%s` がコミットメッセージに一致、`ls issues/done/<basename>.md` が存在
  6. lint/test/build は実行しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
