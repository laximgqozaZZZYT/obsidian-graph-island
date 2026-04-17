---
priority: medium
reported: 2026-04-17
status: pending
source: decomposed
parent: 473-469-graphviewcontainer-wheel-pointer-handler
depends: subtask-3
summary: pan inertia / zoom step 統合の単体テスト追加
---

## Description (subtask of 473-469-graphviewcontainer-wheel-pointer-handler)

subtask-1〜3 の置換後の挙動を検証する vitest を新規追加 (既存 GraphViewContainer テストがあればそこに追記、無ければ新規ファイル)。
  - wheel: deltaY=100 で scale が computeZoomStep の期待値に一致
  - pointermove: 2サンプル投入後に _panVelocity が期待値範囲
  - pointerup: velocity > threshold で rAF ループが起動し、settled 到達で停止
  - rAF はフェイク (vi.useFakeTimers + mock rAF) で制御
  - tests/__mocks__/obsidian.ts の既存 mock を利用

`★ Insight ─────────────────────────────────────`
- GOD OBJECT 制約下での置換戦略: 「メソッド抽出」ではなく「ハンドラ内の式置換 + モジュール関数呼び出し」とすることで、肥大化を避けつつ純粋ロジックは別モジュールに隔離できる。computeZoomStep / applyPanInertia が別ファイルで純粋関数なら単体テストもそちらに寄せられる。
- velocity サンプリングは「直近2サンプル」で十分 (moving average は overkill)。pointermove は 60-120Hz で発火するため、2サンプル差分でも十分滑らかな速度が得られ、保持フィールドも最小限で済む。
- pan inertia の rAF ループは pointerdown で必ずキャンセルすること — さもないと「慣性で流れている途中に次のドラッグ」で位置が二重加算される典型バグを引く。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
