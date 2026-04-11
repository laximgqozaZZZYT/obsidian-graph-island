---
priority: high
reported: 2026-04-11
status: done
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: 慣性パン（InertiaPan）をInteractionManagerに接続
---

## Description (subtask of 093-perf-animation-smoothness)

InertiaPan クラスは実装済みだが接続されていない。

  src/views/InteractionManager.ts:

  1. import { InertiaPan } from "./inertia-pan"

  2. コンストラクタで InertiaPan インスタンス生成:
     this.inertiaPan = new InertiaPan(
       () => true,  // 常時有効（将来設定で制御可能に）
       (dx, dy) => { world.x += dx; world.y += dy; this.host.markDirty(); }
     )

  3. handlePointerMove (パン中): inertiaPan.trackPointer(e.clientX, e.clientY, e.timeStamp)

  4. handlePointerUp (パン終了時): inertiaPan.release()

  5. 新メソッドまたは既存tickに統合: inertiaPan.tick() をレンダーループから呼ぶ

  src/views/RenderPipeline.ts:
  - RenderHost interface に tickInertiaPan?(): boolean を追加
  - renderTick() 内で tickInertiaPan() を呼び、true なら needsRedraw = true

  テスト: inertia-pan.ts の既存テストは純粋関数テスト。統合確認は build + E2E。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
