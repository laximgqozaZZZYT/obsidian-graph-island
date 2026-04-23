---
priority: medium
reported: 2026-04-24
status: pending
source: decomposed
parent: 141-coverage-drop
depends: none
summary: group-label-manager.ts のテスト追加
---

## Description (subtask of 141-coverage-drop)

`src/views/group-label-manager.ts` は 269 stmts/17 fns で 42.4% stmts / 76.5% fns。
  関数数が少なく射程が短い。新規 `tests/group-label-manager.test.ts` で
  未カバー分岐を埋める（collapsed 状態のラベル生成、空グループ、重複ラベル、
  i18n string 経由のラベル、viewMode 切替時の cleanup）。最低10ケース。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
