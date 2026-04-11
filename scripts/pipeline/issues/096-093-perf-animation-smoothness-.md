---
priority: critical
reported: 2026-04-11
status: pending
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: ホイールズームにフレーム補間（スムーズズーム）を導入
---

## Description (subtask of 093-perf-animation-smoothness)

現状: 各wheelイベントでscaleを直接変更 → カクカクしたズーム。
  目標: wheelイベントはターゲットスケールを蓄積し、rAFで現在値→ターゲット値を補間。

  src/views/InteractionManager.ts handleWheel() を改修:

  1. 新フィールド追加:
     - _targetScale: number (目標スケール)
     - _smoothZoomId: number (rAF ID)

  2. handleWheel() 変更:
     - scaleFactor計算は維持
     - 直接 world.scale 変更する代わりに _targetScale を更新
     - _smoothZoomId が未稼働なら smoothZoomTick() をrAFで開始

  3. 新メソッド smoothZoomTick():
     - currentScale → _targetScale を lerp (factor 0.25〜0.3 per frame)
     - |current - target| < 0.001 で停止
     - カーソル位置中心のズーム変換を毎フレーム適用
     - markDirty() でレンダーループを起動

  4. クリーンアップ: destroy() で cancelAnimationFrame(_smoothZoomId)

  テスト: InteractionManager の既存テストパス確認。
  God Object制約: InteractionManager は god object リストに入っていない。変更OK。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
