---
priority: high
reported: 2026-04-11
status: pending
source: kaizen
summary: RenderPipeline.ts と EdgeRenderer.ts に RenderThresholds を経由しないハードコード数値が20箇所以上ある
---

## Description

CLAUDE.md の「All thresholds/magic numbers via RenderThresholds or settings — no hardcoded values」
に違反するハードコード数値が、レンダリングコアの2ファイルに集中している。

issue 078 (done) で layout-compute.ts / KeyboardHandler.ts / matrix-renderer.ts は対応済みだが、
RenderPipeline.ts と EdgeRenderer.ts は未対応。

### RenderPipeline.ts (代表的な箇所)

| 行 | コード | 意味 |
|----|--------|------|
| 193 | `* 1.5` | density scale の sqrt 係数 |
| 195 | `0.3` / `0.5` | density scale の floor / 減衰率 |
| 1022 | `Math.max(0.5, 0.8 / worldScale)` | ストローク幅のフォールバック |
| 1030 | `nodeAlpha * 0.4` | ストロークのアルファ減衰 |
| 1054 | `nodeAlpha *= 0.4` | 非super ノードのフェード |
| 1226 | `worldScale < 0.3` | 低次数ノードフェードのzoomしきい値 |
| 1504 | `baseBgAlpha + 0.1` | ライトテーマのアルファブースト |
| 1703 | `Math.min(4, 1 + (0.5 - zoom) * 6)` | ズームマージンスケール |
| 2224 | `placed.length * 0.3` | カリング比率 |
| 2329 | `* 0.6` | リーダーライン幅係数 |

### EdgeRenderer.ts (代表的な箇所)

| 行 | コード | 意味 |
|----|--------|------|
| 1387 | `Math.min(2.5, 1 / (ws * 2))` | ズーム太さ上限 |
| 1572 | `Math.min(1.3, 1 + (weight - 2) * 0.05)` | weight → alpha 変換 |
| 1622 | `Math.max(0.6, ws / fadeZ)` | 最小太さ比率 |
| 2206 | `Math.min(0.3, ...) * 0.6` | zoomBoost キャップ |
| 2343 | `cfg.edgeHierarchyBoost ?? 0.3` | 階層ブーストデフォルト値 |
| 2554 | `width: 1` | 境界ストローク幅 |

## Acceptance criteria

- [ ] 上記の数値を `RenderThresholds` のプロパティまたは名前付き定数 (`const EDGE_ZOOM_THICKEN_MAX = 2.5` 等) に移動する
- [ ] `computeDensityScale` の係数 (行193, 195) は関数シグネチャの定数引数化も可
- [ ] 既存テスト (`pnpm test`) がパスする
