---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 730-717-status-done-edit
depends: subtask-1
summary: status フィールドを done に Edit して Read で内容を検証
---

## Description (subtask of 730-717-status-done-edit)

前提: subtask-1 で対象ファイルパスと frontmatter 全フィールドの
  初期値 (priority/reported/parent/depends/summary/source/status および
  ## Description 本文) が記録されていること。

  手順:
  1. Read ツールで対象ファイルを読み込み、現在の frontmatter 値を取得
  2. Edit ツールで `status: in-progress` または `status: pending` を
     `status: done` に置換。old_string には周囲の frontmatter 行
     (前後1-2行) を含めて一意性を確保する。例:
       old_string: "reported: 2026-04-18\nstatus: in-progress\nsource:"
       new_string: "reported: 2026-04-18\nstatus: done\nsource:"
  3. Edit 直後に Read で再読込し、以下を検証:
     - `status: done` に変わっている
     - priority/reported/parent/depends/summary/source が subtask-1
       記録値と完全一致
     - `## Description` 以降の本文が 1 文字も変わっていない
       (行数・内容ともに一致)
  4. 差分が想定外の場合は報告のみ行い、ファイルを元に戻さない
     (subtask-3 での git 操作に委ねる)

  禁止事項:
  - git mv / git add / git commit / git restore を実行しない
  - 複数ファイルを同時に編集しない
  - frontmatter 以外 (本文) を変更しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
