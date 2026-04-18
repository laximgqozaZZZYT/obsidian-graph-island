---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 717-691-status-done-edit
depends: none
summary: 対象ファイルを Read して frontmatter を検証
---

## Description (subtask of 717-691-status-done-edit)

subtask-1 で特定されたターゲットファイル (docs/issues/ 配下の .md) を Read ツールで開く。
  frontmatter の `status:` 行を特定し、値が `pending` または `in-progress` であることを確認する。
  もし既に `done` であれば no-op としてこのサブタスクツリーを終了する（後続は skip 報告）。
  priority / reported / parent / depends / summary / source / ## Description / ## Acceptance criteria が存在することも確認する（誤ファイルでないことの確認）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
