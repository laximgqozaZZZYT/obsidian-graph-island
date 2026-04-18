---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 721-702-subtask
depends: none
summary: 編集済み status ファイルを Read で再読込し frontmatter を取得
---

## Description (subtask of 721-702-subtask)

親タスク 702-691-edit-status が編集した issue ファイルを特定し、
  Read ツール (offset=0, limit=30) で frontmatter セクションを再読込する。
  取得した frontmatter ブロック (`---` 〜 `---`) の内容をそのまま次サブタスクに渡せる形で記録する。
  対象ファイルが特定できない場合は、親タスクのログ/コミット履歴 (git log -1) から推定する。
  Acceptance:
  - frontmatter セクション全体が取得できること
  - ファイルパスが記録されること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
