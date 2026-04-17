---
priority: medium
reported: 2026-04-17
status: pending
source: decomposed
parent: 491-483-god-object-graphviewcontainer-ts-8612
depends: none
summary: subtask
---

## Description (subtask of 491-483-god-object-graphviewcontainer-ts-8612)

で 8612 超過と判定された場合のみ実行。
  GraphViewContainer.ts 内の wheel event handler 関連コード
  (onWheel, _handleWheel, _applyWheelZoom 等) を
  src/views/wheel-handler.ts に純粋関数として抽出:
  - createWheelHandler(deps): EventListener を返す factory
  - 依存 (camera, zoom state, etc.) は引数で注入
  GraphViewContainer.ts 側は factory 呼び出しのみ残す。
  行数が 8612 以下に戻ることを `wc -l` で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
