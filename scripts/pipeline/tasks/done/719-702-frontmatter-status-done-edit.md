---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 702-691-edit-status
depends: 701-691-glob-read
summary: frontmatter の status フィールドのみを done に Edit
---

## Description (subtask of 702-691-edit-status)

1. 701-691-glob-read の成果物 (対象 issue ファイルの絶対パス) を受け取る。
  2. Read ツールでファイル冒頭 (offset=0, limit=30) を読み、frontmatter 内の status 行を確認する。
  3. Edit ツールで `status: decomposed` または `status: decomposed` のいずれか1行のみを `status: done` に置換する。
     - old_string は `status: decomposed\n` または `status: decomposed\n` をそのまま指定
     - replace_all は false (frontmatter 1行のみ対象)
  4. priority / reported / parent / depends / summary / source および本文 (Description / Acceptance criteria) は一切変更しないこと。
  5. ファイル末尾の改行や他フィールドの順序も保持すること。
  6. git mv / git commit / git add は実行しない (兄弟タスクに委譲)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
