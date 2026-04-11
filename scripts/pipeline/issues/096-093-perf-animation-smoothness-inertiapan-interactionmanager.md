---
priority: critical
reported: 2026-04-11
status: pending
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: InertiaPan を InteractionManager に接続しパン慣性を有効化
---

## Description (subtask of 093-perf-animation-smoothness)

InertiaPan クラスは実装済みだが未使用。InteractionManager に接続する。

  1. InteractionManager に InertiaPan をインスタンス化
     - import { InertiaPan } from "./inertia-pan"
     - constructor で new InertiaPan(true, (dx, dy) => this.applyPanDelta(dx, dy)) を作成
     - パン操作中（pointerdown → pointermove）で trackPointer() を呼ぶ
     - pointerup で release() を呼び、速度が非ゼロならレンダーループに通知

  2. RenderPipeline の renderTick() にイナーシャ tick を組み込み
     - LayoutTransition.tick() と同じ要領で InertiaPan.tick() を毎フレーム呼ぶ
     - tick() が true を返す間は needsRedraw を立て続ける
     - InertiaPan への参照は InteractionManager 経由か、RenderPipeline に setter で渡す

  3. ポインタダウン時に cancel() で慣性を即停止する
  
  4. inertia-pan.ts の既存テストがあれば確認、なければ基本テスト追加
     - tests/views/inertia-pan.test.ts: release→tick で速度減衰、cancel で即停止

  enforce-gates 全パスを確認してコミット。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
