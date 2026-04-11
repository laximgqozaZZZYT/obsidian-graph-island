---
priority: high
reported: 2026-04-10
status: in-progress
source: decomposed
parent: 066-seamless-animation
depends: subtask-1
summary: スムーズズーム実装（ホイールイベントのrAF補間化）
---

## Description (subtask of 066-seamless-animation)

ホイールズームを瞬間切替から滑らかなアニメーションに変更。

  1. src/views/smooth-zoom.ts を新規作成:
     - SmoothZoom クラス:
       - targetScale / currentScale を持つ
       - enqueue(deltaY, anchorX, anchorY) — ホイール入力を目標に蓄積
       - tick(dt): boolean — currentScale を targetScale に向けてイージング補間
         ※ animation.ts の easeOutExpo ベースで、連続ホイール入力を自然に合成
       - applyTo(world) — world transform に反映
       - cancel() — 即座に targetScale へジャンプ
     - 定数: ZOOM_LERP_SPEED = 8-12（フレームレート非依存の指数的接近速度）
     - enableAnimations=false 時は即座に反映（フォールバック）

  2. InteractionManager.ts の handleWheel (L362-400) を修正:
     - 直接 world.scale 変更 → SmoothZoom.enqueue() 呼び出しに変更
     - SmoothZoom.tick() を shared-ticker のコールバックに登録
     - 既存の computeZoomFactor / clampScale は引き続き利用

  3. テスト: tests/views/smooth-zoom.test.ts を新規作成:
     - enqueue → tick で scale が targetScale に近づくことを確認
     - 連続 enqueue で target が蓄積されること
     - cancel で即座に target に到達
     - ZOOM_SCALE_MIN/MAX の範囲制限
     - enableAnimations=false のフォールバック
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
