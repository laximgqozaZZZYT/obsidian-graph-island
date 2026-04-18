---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 758-730-status-done-edit
depends: subtask-1
summary: Edit ツールで status 値を done に置換
---

## Description (subtask of 758-730-status-done-edit)

subtask-1 で特定した status 行を Edit ツールで置換する。
  old_string には一意性確保のため周囲 2-3 行の frontmatter を含める
  (例: "priority: high\nreported: 2026-04-18\nstatus: in-progress\nsource: decomposed")。
  new_string は old_string の status 値部分のみを "done" に変更したもの。
  replace_all は使用しない (単一置換を確実にするため)。
  Edit 成功を確認して終了。
  git mv / git add / git commit / git status は一切実行しない
  (後続タスク 756-729-status-done-git-ops 等に委譲)。
  Read / 検証も後続タスク (755-729-read-frontmatter 等) に委譲。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
