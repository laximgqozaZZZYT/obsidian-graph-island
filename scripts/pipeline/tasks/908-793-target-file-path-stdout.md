---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 793-763-subtask
depends: subtask-1
summary: TARGET_FILE=<path>形式のstdout出力を追加
---

## Description (subtask of 793-763-subtask)

subtask-1で特定した位置に、検出した変更ファイルパスを
  `TARGET_FILE=<path>` 形式でstdoutに1行出力する処理を追加。
  - 複数ファイル時は各行 `TARGET_FILE=<path>` で出力
  - 既存のログ出力とは区別できる機械可読形式
  - ファイルが無い場合は何も出力しない (空のTARGET_FILE=は禁止)
  bashテスト (bats or 手動実行+grep確認) で出力形式を検証。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
