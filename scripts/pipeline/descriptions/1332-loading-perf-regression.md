---
priority: high
reported: 2026-04-26
status: pending
source: user
summary: 読み込み時の動作が異様に重い — 昨日比でプラグインロードが体感で大幅に遅くなった
---

## Description

ユーザー報告 (2026-04-26 15:50 JST):
> 「昨日時点の obsidian-graph-island プラグインと比べて、読み込み時の動作が異様に重くなっている」

24h 内の主要変更 (regression 原因候補):
- WebGL renderer 拡張: WebGLApp +829, WebGLGraphics +1030, tessellator +715
- 新ビューモード: sunburst-renderer +319, timeline-bar-renderer +370, semantic-zoom-renderer +213
- グラフ基盤: GraphSnapshot +179, render-pipeline-utils +276, phantom-node-generator +100
- 新ユーティリティ: ManagedTimers / TimerRegistry / panel-sections-* helpers
- 21+ 新規定数 export (pathfinder/node-decoration)
- 138 ファイル変更、+58997/-45836 行
- bundle 795KB / 800KB (98% — 起動 parse 時間増の可能性)

調査ポイント (priority 順):
1. **bundle size**: 795KB は budget ぎりぎり。前日比でどれだけ増えたか
2. **load-time critical path**: main.ts → GraphViewsPlugin onload で何がブロックしているか
3. **TTI (Time-To-Interactive)**: memory `project_perf_tti.md` に過去最適化 (22s→9.6s) — 再リグレッション疑い
4. **`buildGraphFromVault()` の重さ**: 大量 metadata-parser 呼び出し
5. **WebGL 初期化**: shader compile / tessellator init が同期で走っていないか
6. **snapshot lazy load**: `ensureSnapshotsLoaded()` が起動 critical path に入ってしまっていないか
7. **panel/legend init**: PanelBuilder rebuilds が onload 中に複数発火していないか

## Acceptance criteria

- [ ] Plugin onload → first interactive frame の時間を計測 (CDP `performance.now()`)
- [ ] 24h 前との時間差を数値化
- [ ] root cause を特定 (上記 1-7 のどれか、または別要因)
- [ ] 修正後、TTI が 24h 前の水準まで戻る
- [ ] memory `project_perf_tti.md` に regression 経緯と fix を追記

## Notes

- `/plan` での実行希望 (ユーザー指定)
- ユーザー issue は autonomous より優先度高
- Phase R 候補

## Initial investigation (2026-04-26 16:50 JST)

CDP A/B 計測 (yesterday build = `99df3a19` vs current HEAD):

| 指標 | yesterday (24h前) | current (HEAD) | delta |
|---|---|---|---|
| bundle size | 775.4 KB | 776.9 KB | +0.2% |
| enable avg (3run) | 631 ms (551-714) | 562 ms (462-682) | **-70 ms (高速化)** |
| invalidateAndRebuild avg (5run) | 183 ms | 181 ms | ほぼ同等 |
| getGraphData (5run) | 1.5-5 ms | 1.2-2.4 ms | ほぼ同等 |

**結論: Canvas2D / disable-enable シナリオでは regression 検出されず。**

未測定で重さの可能性がある領域:
1. **Cold start** — Obsidian 起動時の main.js 初回 parse + plugin onload (今回 disable/enable のみ計測)
2. **WebGL モード** — useWebGL=true 時の shader compile / tessellator init
3. **特定操作** — hover / scroll / zoom / search / 大量 selection
4. **TTI 過去最適化 (memory: project_perf_tti.md = 9.6s)** からの劣化
5. ユーザー固有環境 (マシン spec / 別プラグイン干渉)
6. 「昨日」の認識ずれ (実際は数日〜週前のバージョンとの比較)

autonomous で next-step probes を decompose 推奨。
