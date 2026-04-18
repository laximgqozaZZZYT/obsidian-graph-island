---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 871-747-subtask
depends: none
summary: GraphViewContainer から snapshot ロジックを独立ファイルに抽出
---

## Description (subtask of 871-747-subtask)

GraphViewContainer.ts 内のスナップショット関連メソッド (作成/復元/プリセット保存などの状態シリアライズ処理) を src/views/snapshot-service.ts に純粋関数として抽出する。
  - 対象: takeSnapshot / restoreSnapshot / serializeState 系
  - GraphViewContainer からは抽出関数を import して委譲呼び出しに置き換え
  - 新規 snapshot-service に最低限のユニットテストを追加 (round-trip, null/undefined 入力)
  - CLAUDE.md の Max Allowed を削減後の行数に更新 (例: 8597 → 8400 前後)
  - pnpm test / pnpm lint / pnpm build 全通過を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
