---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 691-662-subtask-status-done
depends: none
summary: 対象ファイルを Glob/Read で特定
---

## Description (subtask of 691-662-subtask-status-done)

1. Glob ツールで `issues/pending/*639-626*subtask*.md` にマッチするファイルを列挙する
  2. 複数ヒットした場合は各ファイルの frontmatter を Read で確認し、`summary: subtask issueのstatusをdoneに更新しコミット` と完全一致するものを選択する
  3. 選択したファイルの絶対パスと現在の `status:` 値 (`pending` または `in-progress`) を記録する
  4. この段階ではファイル編集は行わない (特定のみ)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
