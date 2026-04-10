---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 066-seamless-animation
depends: none
summary: アニメーションユーティリティ基盤の作成（イージング関数統合 + 型定義 + 設定項目）
---

## Description (subtask of 066-seamless-animation)

アニメーション関連のユーティリティを統合・新設する基盤タスク。

  1. src/utils/animation.ts を新規作成:
     - LayoutTransition.ts の easeInOutCubic (L110-113) を移動
     - GVC の ease-out quadratic (L7921 inline) を関数として抽出
     - 追加イージング: easeOutCubic, easeOutExpo
     - lerp(a, b, t) ユーティリティ関数
     - clampedLerp(a, b, t) 関数
     - AnimationTimer クラス: start/tick/cancel/isRunning/progress
       (LayoutTransition のパターンを汎用化、prefers-reduced-motion 対応内蔵)
     - decayVelocity(v, friction, dt) — 慣性減衰の純粋関数

  2. src/types.ts に設定項目を追加:
     - enableAnimations: boolean (default true) — アニメーション全体の有効/無効
     - animationDuration: number (default 400) — 基本アニメーション時間(ms)
     - enableInertia: boolean (default true) — 慣性スクロール有効/無効
     ※ RenderThresholds に追加（既存のパターンに従う）

  3. src/i18n.ts に設定ラベルを追加:
     - "Enable animations" / "Animation duration" / "Enable inertia"

  4. LayoutTransition.ts を修正:
     - 自前の easeInOutCubic を animation.ts からの import に置換
     - 動作変更なし（リファクタのみ）

  5. テスト: tests/utils/animation.test.ts を新規作成:
     - 各イージング関数の境界値テスト (t=0→0, t=1→1, 単調増加)
     - lerp/clampedLerp のテスト
     - AnimationTimer の start/tick/cancel テスト
     - decayVelocity のテスト (friction=0→保持, friction=1→0)
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
