---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 793-763-subtask
depends: none
summary: git-diff-statusスクリプトの現状調査とTARGET_FILE出力ポイント特定
---

## Description (subtask of 793-763-subtask)

親タスク763-731-git-diff-statusで作成された既存スクリプトを読み、
  変更ファイルを検出している箇所を特定する。
  `TARGET_FILE=<path>` 形式をstdoutに出力する最適な位置
  (検出直後 / 最終出力) を決定し、Grepで既存の類似出力パターン
  (例: `RESULT=`, `STATUS=`) があれば踏襲方針を決める。
  実装コード変更は次のsubtaskで実施。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
