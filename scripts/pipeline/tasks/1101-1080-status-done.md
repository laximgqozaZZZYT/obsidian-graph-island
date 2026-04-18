---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1080-1063-issue-status-done
depends: none
summary: 対象ファイル探索とstatusフィールドのdone更新
---

## Description (subtask of 1080-1063-issue-status-done)

1. 対象ファイル特定:
     - 第一候補: `issues/1026-1014-639-626-subtask-status-done.md`
     - 見つからない場合は Glob で `issues/pending/1026-*status-done*.md` と `issues/in-progress/1026-*status-done*.md` を探索
     - 見つからない場合はタスク終了 (exit 0、既に処理済みとみなす)

  2. Read tool で該当ファイルを読み、frontmatter の現在の status 値を確認
     (`status: in-progress` または `status: pending`)

  3. Edit tool で置換 (replace_all=false):
     - old_string: `status: in-progress` (または `status: pending`、実際に存在する方)
     - new_string: `status: done`
     - 他のフィールド (priority, reported, source, parent, depends, summary) は触らない

  4. 検証:
     - `git status --short` 実行 → 対象ファイル1件のみ `M` で出ること
     - `git diff <file>` 実行 → 変更行が status 行のみ、`---` 区切りが破損していないこと
     - frontmatter 全体を Read で再確認し、他フィールドが保持されていること

  5. 受け入れ基準チェックリスト全て満たしていれば完了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
