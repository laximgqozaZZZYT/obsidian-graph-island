---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 662-658-subtask-issue-done-git-mv
depends: none
summary: 対象 subtask ファイル特定と status を done に書き換え
---

## Description (subtask of 662-658-subtask-issue-done-git-mv)

1. Glob で `issues/pending/*639-626*subtask*.md` にマッチするファイルを列挙する。
2. 複数ヒットした場合は Read で frontmatter を確認し、`summary: subtask issueのstatusをdoneに更新しコミット` と一致するファイルを選択する。
3. Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に置換する。priority / reported / parent / depends / summary など他フィールドは一切変更しない。
4. 本文 (Description / Acceptance criteria) も変更しない。
5. この時点ではまだ git mv / commit は行わない (兄弟タスクに委譲)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
