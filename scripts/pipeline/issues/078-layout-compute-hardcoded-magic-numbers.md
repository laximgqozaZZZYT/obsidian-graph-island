---
priority: high
reported: 2026-04-11
status: in-progress
source: kaizen
summary: layout-compute.ts のタイムライン計算に 5 箇所のハードコードマジックナンバーがある (CLAUDE.md 違反)
---

## Description

`src/views/layout-compute.ts` のタイムラインレイアウト計算に、`RenderThresholds` を経由しない
ハードコード数値が集中している。CLAUDE.md の「All thresholds/magic numbers via
RenderThresholds or settings — no hardcoded values」に違反。

| 行 | コード | 値 | 意味 |
|----|--------|-----|------|
| 282 | `Math.max(8, (W - 120) / numSteps)` | 8, 120 | stepWidth 最小値, キャンバス余白 |
| 283 | `Math.max(20, Math.round(H / 20))` | 20, 20 | laneHeight 最小値, 分割数 |
| 284 | `Math.max(Math.round(laneH * 0.3), 4)` | 0.3, 4 | barHeight 比率, 最小値 |
| 196 | `Math.min(60 + endIdx * stepW, ...)` | 60 | X オフセット |
| 187 | `Math.max(stepW * 3, 30)` | 30 | バー幅上限 |
| 201 | `Math.max(stepW, 10)` | 10 | バー幅下限 |

同様の問題:
- `src/views/KeyboardHandler.ts:193` — `Math.min(10, ...)` hoverHops 上限
- `src/views/matrix-renderer.ts:256` — `Math.min(50, ...)` matrix ノード上限, `/16` セルサイズ

## Acceptance criteria

- [ ] layout-compute.ts の 6 箇所の数値を `RenderThresholds` または名前付き定数に移動する
- [ ] KeyboardHandler.ts, matrix-renderer.ts の数値も同様に対応する
- [ ] 既存テスト (`pnpm test`) がパスする
