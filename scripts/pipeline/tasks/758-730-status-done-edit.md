---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 730-717-status-done-edit
depends: subtask-1 (parent chain)
summary: status フィールドを done に Edit で置換
---

## Description (subtask of 730-717-status-done-edit)

1. subtask-1 で記録した対象ファイルパスと frontmatter 値を入力として受け取る。
  2. Edit ツールで `status: in-progress` または `status: in-progress` を `status: done` に置換。
  3. `old_string` には一意性確保のため周囲 2-3 行の frontmatter を含める
     (例: `priority: medium\nreported: 2026-04-18\nstatus: in-progress\nsource: decomposed`)。
  4. Edit 成功を確認して終了。Read/git status は後続タスクに委譲。
  5. git mv / git add / git commit は一切実行しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
