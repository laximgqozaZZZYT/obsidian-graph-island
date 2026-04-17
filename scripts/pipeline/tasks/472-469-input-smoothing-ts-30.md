---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 469-138-
depends: subtask-1
summary: input-smoothing.tsを純粋関数として新規作成しユニットテスト30+件
---

## Description (subtask of 469-138-)

新規ファイル src/utils/input-smoothing.ts を作成 (既存God Objectを肥大化させない):
  - computeZoomStep(deltaY: number, currentScale: number, prevTimestamp: number, now: number): { nextScale: number; lerpedDelta: number } — RenderThresholds.ZOOM_LERP / ZOOM_STEP_MAX_DT_MS 参照、指数減衰補間
  - applyPanInertia(velocity: {x:number;y:number}, dtMs: number, friction: number): { velocity: {x:number;y:number}; displacement: {x:number;y:number}; settled: boolean } — friction は RenderThresholds.PAN_FRICTION をcaller側で渡す
  ファイルから import して状態は持たない (caller側で保持)。
  tests/utils/input-smoothing.test.ts に30+ケース:
  - computeZoomStep: 加速/減速/方向反転/dt=0/dt>MAX/極小deltaY/極大deltaY/scale=0.01/scale=100/NaN耐性
  - applyPanInertia: velocity=0 即settled/friction=0境界/friction=1 (減衰なし)/dtMs=0/dtMs>MAX_MS/min_velocity以下でsettled=true/負velocity/両軸異方向
  CLAUDE.md: 新ファイルなのでGod Object違反なし。i18n対象文字列なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
