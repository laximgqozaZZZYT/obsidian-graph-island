---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 066-seamless-animation
depends: subtask-1
summary: 慣性パン実装（フリック後の減速スクロール）
---

## Description (subtask of 066-seamless-animation)

パン操作にフリック慣性を追加。

  1. src/views/inertia-pan.ts を新規作成:
     - InertiaPan クラス:
       - trackPointer(screenX, screenY, timestamp) — ドラッグ中の速度追跡
         ※ 直近 50-100ms のポインタ履歴から速度を算出
       - release(): {vx, vy} — ポインタリリース時の速度ベクトルを返す
       - tick(dt): boolean — decayVelocity で速度を減衰しつつ world 位置を更新
         ※ 速度が閾値 (0.5px/frame) 以下で停止、true=継続/false=終了
       - cancel() — 慣性を即停止（新しい操作開始時）
     - 定数: FRICTION = 0.92, MIN_VELOCITY = 0.5
     - enableInertia=false 時は release() で即停止

  2. InteractionManager.ts を修正:
     - handlePointerMove 中: InertiaPan.trackPointer() 呼び出し追加
     - handlePointerUp (パン終了時): InertiaPan.release() → tick を shared-ticker に登録
     - 新しいパン/ズーム操作開始時: InertiaPan.cancel()

  3. テスト: tests/views/inertia-pan.test.ts を新規作成:
     - trackPointer → release で速度ベクトルが算出されること
     - tick ごとに速度が FRICTION 分減衰すること
     - MIN_VELOCITY 以下で tick が false を返すこと
     - cancel で即停止
     - enableInertia=false のフォールバック
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
