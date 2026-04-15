---
priority: medium
reported: 2026-04-15
status: pending
source: decomposed
parent: 133-type-assertions
depends: none
summary: View参照・インターフェース型キャストの除去（`as GraphViewContainer` 等 約20箇所除去）
---

## Description (subtask of 133-type-assertions)

View間参照での不要な型キャストを正しいインターフェース型定義で除去。
  1. `src/main.ts`: `view as unknown as GraphViewContainer` → Obsidianのview型を正しく拡張（ItemViewサブクラスとしての型定義）。コマンド登録時の4箇所を修正
  2. `as KeyboardHost[...]` → KeyboardHostインターフェースをGVCが正しくimplementsするよう型定義調整（3箇所）
  3. `as EdgeDrawConfig` → 関数パラメータ型を正しく定義（4箇所）
  4. `as CardText` → 正しい戻り値型（4箇所）
  5. `as GraphViewContainer` (main.ts) → getActiveView()の戻り値型をユニオンに
  6. GVCの行数増加禁止: 型定義はtypes.tsまたはインターフェースファイルに置く
  想定除去数: ~20

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
