## Description (subtask of 1701-density-heatmap-per-frame-alloc)

`src/views/density-heatmap.ts` を新規作成し、現状 `GraphViewContainer.ts:6609-6635` にある
  `_accumulateDensityGrid` を pure function として extract する。

  API シグネチャ (案A: projector + iterator で alloc 0 を保証):
  ```typescript
  export interface NodeProjector {
    (node: unknown): { sx: number; sy: number; visible: boolean } | null;
  }
  export function accumulateDensityGrid(
    nodes: Iterable<unknown>,
    project: NodeProjector,
    cols: number,
    rows: number,
    cell: number,
    radius: number,
    sigmaFactor: number, // 現在ハードコードされている 0.8
  ): Float32Array;
  ```

  - `DensityPoint[]` 型は **export しない** (中間配列を作らせないため)。
  - GVC 側 `_accumulateDensityGrid` は削除し、`_renderDensityHeatmap` (line 6587) から
    新関数を呼ぶ。projector は GVC 内で `(pn) => { gfx.visible なら {sx,sy,true} } ` を返す
    inline lambda として渡す (毎フレーム lambda 1 個のみ確保、配列は確保しない)。
  - `HEATMAP_CELL_SIZE` `HEATMAP_GAUSSIAN_RADIUS` `HEATMAP_MIN_VALUE` は既存の constants からimport。
  - sigmaFactor (現 hardcoded 0.8) は引数化し、callerは `HEATMAP_GAUSSIAN_SIGMA_FACTOR` 定数を渡す。
  - `pnpm build` `pnpm lint` `pnpm format:check` が pass すること。
  - GVC の行数が減ることを確認 (godobj ratchet 対象)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
