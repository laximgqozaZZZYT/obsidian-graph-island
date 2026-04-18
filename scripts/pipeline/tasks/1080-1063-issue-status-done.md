---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1063-1026-subtask
depends: none
summary: 親issueファイルのstatusをdoneに更新
---

## Description (subtask of 1063-1026-subtask)

対象ファイル: `issues/1026-1014-639-626-subtask-status-done.md` (存在しない場合は `issues/pending/` または `issues/in-progress/` 配下を glob で探索)

  変更内容:
  - フロントマター内の `status: in-progress` (または `status: pending`) を `status: done` に置換
  - Edit tool を使用、`replace_all=false` 指定
  - 他のフィールド (priority, reported, source, parent, depends, summary) は保持

  検証:
  - `git status --short` で対象ファイル1件のみ変更されていることを確認
  - `git diff <file>` で status 行のみが変更されていることを確認
  - フロントマター構造 (`---` 区切り) が壊れていないこと

  受け入れ基準:
  - [ ] status フィールドのみが `done` に変更
  - [ ] 他ファイルへの波及なし
  - [ ] frontmatter の他フィールドが全て保持される

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
