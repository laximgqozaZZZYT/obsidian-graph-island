---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 871-747-subtask
depends: subtask-3
summary: CLAUDE.md の GraphViewContainer.ts Max Allowed を最終値に確定
---

## Description (subtask of 871-747-subtask)

subtask-1〜3 の抽出完了後、GraphViewContainer.ts の実際の行数 (wc -l) を測定し、CLAUDE.md の "Max Allowed" 列をその値に更新する。
  - 同時に Decomposition Priority 記述から完了済み項目 (snapshot/export/filter) を削除、残タスクを追記
  - 親 issue 747-725 にリンクするコメントを CLAUDE.md には書かず、コミットメッセージで言及
  - 変更は CLAUDE.md のみ。コード・テストは触らない

`★ Insight ─────────────────────────────────────`
- subtask-1〜3 は同じ GraphViewContainer.ts を編集するため厳密に直列化。並列 Task dispatch は避けること
- 各サブタスク完了時に必ず CLAUDE.md の Max Allowed を下げる — これが "ratchet down only" ポリシーの実装
- subtask-4 を最後に分離することで、抽出作業中の一時的な行数変動と最終確定を分離できる (失敗時のロールバック単位が明確)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
