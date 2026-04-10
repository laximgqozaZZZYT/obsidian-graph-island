---
priority: medium
reported: 2026-04-10
status: pending
source: decomposed
parent: 064-comprehensive-perf-regression
depends: none
summary: subtask
---

## Description (subtask of 064-comprehensive-perf-regression)

`★ Insight ─────────────────────────────────────`
**調査結果のハイライト:**
- `doRender()` が約40箇所から呼ばれるGod Function。フィルタ1つ変えるだけでCanvas破棄→再生成
- `buildGraphFromVault()` は同期実行で毎回 `doRender()` 内で呼ばれる（非同期化済みとissueにあるが、実際はまだ同期パス）
- `rebuildSpatialGrid()` が毎dirty frameで無条件実行
- ミニマップが `needsRedraw=false` でもRAFフル頻度で描画
- レイアウト計算は全てメインスレッド同期
`─────────────────────────────────────────────────`

調査結果に基づき、タスク分解を行います。

---

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
