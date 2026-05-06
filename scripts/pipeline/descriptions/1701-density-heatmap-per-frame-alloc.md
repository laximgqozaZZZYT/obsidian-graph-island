## Description

PR #232 (autonomous refactor session auto-20260505-220001) で `src/views/density-heatmap.ts` に
extract された `accumulateDensityGrid` の caller 側で、毎フレーム `DensityPoint[]` 配列を
新規確保する hot-path bloat が発生している。

`src/views/GraphViewContainer.ts:2162-2164 _renderDensityHeatmap` は `onPreFlush` 経由で
**毎レンダーフレーム** 実行され、density overlay が ON のとき毎回:

```typescript
const points: DensityPoint[] = [];
for (const node of visibleNodes) {
  points.push({ sx, sy });  // 約 2000 件のオブジェクト literal を毎フレーム new
}
accumulateDensityGrid(points, grid, ...);
```

extract 前は accumulation loop の中でインラインに射影していたため allocation 0。

vault サイズ 2232 ノード (project memory) で常時 ON なら **毎フレーム +2000 オブジェクト + array** 生成
→ GC pressure と TTI 悪化のリスク。

## Root cause hypothesis

LLM が helper を「pure function を array で受ける」形に extract したが、caller 側の
allocation コストを無視。stream/iterator/projector callback 設計なら allocation 0 を維持できた。

## Acceptance criteria

- [ ] `_renderDensityHeatmap` で毎フレームの `DensityPoint[]` 配列確保を削除
- [ ] 解決手段は次のいずれか:
   - 案 A: `accumulateDensityGrid` を `Iterable<DensityPoint>` 受け取りに変更
     + caller 側で generator/iterator を使い lazy 化
   - 案 B: `accumulateDensityGrid(getNthPoint, count, grid, ...)` のように
     `(i: number) => {sx, sy}` projector callback を受ける形に変更
   - 案 C: GVC 側にスクラッチバッファ (`private _heatmapPointsBuf: DensityPoint[] = []`) を
     再利用して `points.length = 0` で reset
- [ ] `tests/views/density-heatmap.test.ts` の既存ケースが PASS のまま
- [ ] 新たに per-frame allocation を検証する microbenchmark
      (vault 2000 node のときに per-call alloc が boundedになる) を追加

## Candidate files
- `src/views/GraphViewContainer.ts:2162-2164` (`_renderDensityHeatmap` caller)
- `src/views/density-heatmap.ts:32, 73` (`accumulateDensityGrid`, `drawDensityHeatmap`)
- `src/views/density-heatmap.ts:9-11` (`DensityPoint` 型定義)
- `tests/views/density-heatmap.test.ts:64-83, 155-170` (関連テスト)

## Bonus (このタスクに含めるか別 issue にするかは impl 判断)
- `density-heatmap.ts:32` の magic `0.8` を `GVC_HEATMAP_GAUSSIAN_SIGMA_FACTOR` に
- `density-heatmap.ts:73` の magic `0.25` を `GVC_HEATMAP_FILL_ALPHA` に
  (兄弟 const は constants.ts:549, 721, 722 にすでに揃っている)
