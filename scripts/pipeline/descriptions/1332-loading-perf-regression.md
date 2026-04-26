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
