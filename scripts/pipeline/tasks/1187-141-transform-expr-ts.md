---
priority: medium
reported: 2026-04-24
status: pending
source: decomposed
parent: 141-coverage-drop
depends: none
summary: transform-expr.ts 分岐テスト拡充
---

## Description (subtask of 141-coverage-drop)

`src/utils/transform-expr.ts` (374 行) は既に `tests/transform-expr.test.ts` を持つが、function coverage 向上の効きが大きいファイル。
  既存テストでカバーされていない export / 分岐を洗い出して以下を追加:
  - 各 op (add / sub / mul / div / mod など) の正常系 1 ケース
  - div-by-zero / NaN 入力の fallback 分岐
  - 未知 op のエラー分岐
  - 型強制 (string→number, number→string) の境界
  `describe("transform-expr coverage fill", ...)` ブロックを末尾追加。既存 assertion は変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
