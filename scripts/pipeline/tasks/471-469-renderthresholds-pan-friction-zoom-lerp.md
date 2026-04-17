---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 469-138-
depends: none
summary: RenderThresholdsにPAN_FRICTION/ZOOM_LERP等の補間定数を追加
---

## Description (subtask of 469-138-)

src/render-thresholds.ts の RenderThresholds に以下のキーを追加 (ハードコード禁止ポリシー遵守):
  - ZOOM_LERP: number (例 0.18) — 指数減衰補間係数
  - ZOOM_STEP_MAX_DT_MS: number (例 120) — ホイール連続入力統合時間
  - PAN_FRICTION: number (例 0.92) — パン慣性減衰率 (1frame相当)
  - PAN_INERTIA_MIN_VELOCITY: number (例 0.05) — 慣性終了しきい値 (px/ms)
  - PAN_INERTIA_MAX_MS: number (例 800) — 慣性上限
  既存の定数グルーピングに合わせて配置。tests/render-thresholds.test.ts に型と値域(正の有限数)のアサートを追記。新規magic number禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
