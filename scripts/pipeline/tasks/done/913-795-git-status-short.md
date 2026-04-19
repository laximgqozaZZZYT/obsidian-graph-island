---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 795-764-subtask
depends: none
summary: 対象ファイルの git status --short 状態を取得して記録
---

## Description (subtask of 795-764-subtask)

`git status --short <parent task 対象 path>` を実行し、対象ファイルの working tree / index 状態を確認する。
  - 親タスク 764-731 で指定された対象パスを `git status --short <path>` で照会
  - 出力が空（クリーン）か、' M'(modified)/'M '(staged)/'??'(untracked) のどれかを判定
  - add/commit/mv は実行禁止。結果をタスクログに文字列で記録するのみ
  - 完了条件: 状態文字列（例: " M path/to/file" または empty）をタスクのフロントマターまたはログに追記

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
