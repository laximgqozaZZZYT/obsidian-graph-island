---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 793-763-subtask
depends: subtask-2
summary: パイプライン側でTARGET_FILE=<path>を読み取る契約をドキュメント化
---

## Description (subtask of 793-763-subtask)

新規ファイル作成はせず、既存ドキュメントまたはスクリプト先頭コメントに
  `TARGET_FILE=<path>` のstdout契約を1-3行で記述。
  - 形式: `TARGET_FILE=<絶対または相対パス>`
  - 消費側: autonomous-improve.sh など
  既存ドキュメントが無い場合はこのsubtaskをスキップし、
  SUBTASK2のスクリプト内コメントで完結させる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
