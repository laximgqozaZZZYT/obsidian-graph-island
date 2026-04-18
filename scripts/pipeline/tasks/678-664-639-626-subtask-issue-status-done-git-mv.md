---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 664-662-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv でコミット
---

## Description (subtask of 664-662-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定 (frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」のもの)。
     0件なら `issues/done/*639-626*subtask*.md` を確認し、done 済みなら no-op で終了。
  2. Read でファイル全体を確認し、Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に書き換える。他フィールド (priority/reported/parent/depends/summary/source) と本文は変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で pending delete + done add + status modify のみ確認。
  5. `git add -A && git commit -m "chore: done <filename> — GVC test report appended"` でコミット。`<filename>` は拡張子なしベース名。
  6. src/** やテスト・設定ファイルは変更しない。lint/test/build は実行不要。
  7. 検証: `git status` クリーン、`git log -1 --pretty=%s` 一致、`ls issues/done/<filename>.md` 存在確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
