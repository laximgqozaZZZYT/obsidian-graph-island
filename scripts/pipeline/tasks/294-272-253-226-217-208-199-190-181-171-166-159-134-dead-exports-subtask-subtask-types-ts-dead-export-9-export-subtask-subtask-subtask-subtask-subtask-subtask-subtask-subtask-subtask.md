---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

`★ Insight ─────────────────────────────────────`
Dead export削除は、`export`キーワードを外すだけの安全な変更です。型がファイル内部で使われている場合（例: `AxisConfig`が`CoordinateLayout`内で参照）、exportを外しても内部参照は壊れません。ただし、型の再エクスポートチェーンやプラグインAPIとして外部公開している可能性も確認が必要です。
`─────────────────────────────────────────────────`

17個のdead exportsが特定されました。元タスクの文脈から「export キーワードを外す」作業です。安全に分解します。

---

## タスク分解結果

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
