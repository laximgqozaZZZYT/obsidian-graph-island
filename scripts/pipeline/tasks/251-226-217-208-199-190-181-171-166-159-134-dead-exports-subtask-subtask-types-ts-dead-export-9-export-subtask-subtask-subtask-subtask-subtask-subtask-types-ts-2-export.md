---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.tsから未使用型ガード関数2件のexportを除去
---

## Description (subtask of 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask)

以下の2つの型ガード関数からexportキーワードを削除する:
  - `isClusterArrangement` (line 145): `export function` → `function`
  - `isSortKey` (line 314): `export function` → `function`
  どちらも types.ts 内部でのみ使用されている（外部参照ゼロ）。
  関数自体が types.ts 内で呼ばれていないなら、関数定義ごと削除する。
  pnpm build && pnpm test で確認。

---

2タスクとも独立して並列実行可能です。合計変更行数は各タスク10行未満で、1セッションで余裕を持って完了できます。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
