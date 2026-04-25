
## Description (subtask of 662-658-subtask-issue-done-git-mv)

1. Glob で `issues/pending/*639-626*subtask*.md` にマッチするファイルを列挙する。
2. 複数ヒットした場合は Read で frontmatter を確認し、`summary: subtask issueのstatusをdoneに更新しコミット` と一致するファイルを選択する。
3. Edit で frontmatter の `status: decomposed` または `status: decomposed` を `status: done` に置換する。priority / reported / parent / depends / summary など他フィールドは一切変更しない。
4. 本文 (Description / Acceptance criteria) も変更しない。
5. この時点ではまだ git mv / commit は行わない (兄弟タスクに委譲)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
