---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 719-702-frontmatter-status-done-edit
depends: 701-691-glob-read
summary: 対象issueファイルのstatus行をdoneにEditで置換
---

## Description (subtask of 719-702-frontmatter-status-done-edit)

1. 前段タスク 701-691-glob-read の成果物として渡された対象 issue ファイルの絶対パスを受け取る。
  2. Read ツールで offset=0, limit=30 を指定してファイル冒頭を読み取り、frontmatter 内の status 行の現在値を確認する (`status: pending` / `status: in-progress` / それ以外)。
     - 既に `status: done` の場合は何もせず正常終了 (冪等性)。
     - frontmatter 内に status 行が存在しない場合はエラーとして終了 (後続タスクがブロック判定できるよう明確に失敗)。
  3. Edit ツールで status 行1行のみを置換する:
     - old_string: `status: pending\n` または `status: in-progress\n` のどちらか確認した実値
     - new_string: `status: done\n`
     - replace_all: false
  4. priority / reported / parent / depends / summary / source の各フィールド、YAML フロントマター区切り (`---`)、本文 (Description / Acceptance criteria)、ファイル末尾の改行は一切変更しないこと。
  5. git mv / git add / git commit は実行しない (別タスクに委譲)。
  6. Write ツールは使わない (全文上書きは禁止、Edit のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
