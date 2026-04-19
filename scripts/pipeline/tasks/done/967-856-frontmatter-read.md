---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 856-737-status-line-count-verify
depends: none
summary: 親タスク編集対象ファイルを特定し frontmatter を Read で取得
---

## Description (subtask of 856-737-status-line-count-verify)

1. 親タスク `702-691-edit-status` のログまたは issue 一覧から編集対象ファイルパス1件を特定
  2. そのファイルに対し Read (offset=0, limit=30) を実行し frontmatter 全体をキャプチャ
  3. 取得した frontmatter 行を次タスク用に記録 (stdout に dump)
  4. コード編集なし。ファイルパスが特定できない場合は FAIL 報告して終了

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
