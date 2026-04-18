---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 802-769-git-status-short
depends: subtask-1
summary: repository state が変更されていないことを検証
---

## Description (subtask of 802-769-git-status-short)

/home/ubuntu/obsidian-plugins/obsidian-graph-island にて以下を実行:
  1. `git diff --quiet && git diff --cached --quiet; echo "CLEAN=$?"` で state 未変更を確認 (CLEAN=0 期待)
  2. `git status --short | diff - /tmp/git-status-short.txt; echo "MATCH=$?"` で subtask-1 取得時と同一 state 維持を確認 (MATCH=0 期待)
  3. いずれか失敗時はエラー報告して終了 (state 復旧は行わない、ユーザー判断に委ねる)
  Acceptance:
  - [ ] CLEAN=0 (working tree + index 変更なし)
  - [ ] MATCH=0 (subtask-1 時点と state 同一)
  - [ ] CLAUDE.md ルール遵守 (god object / coverage いずれも N/A)

`★ Insight ─────────────────────────────────────`
元タスクが既に単一の claude -p セッションで完結可能なサイズだったため、2 タスクに留めました。subtask-1 がデータキャプチャ、subtask-2 が read-only 保証の検証ゲートで、後続パイプライン (760-730 subtask 2) が生データを消費する前の契約を担保します。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
