## Description (subtask of 1314-settimeout-leaks)

PanelContext.timers (ManagedTimers, 既存) を使って以下4箇所の生 `setTimeout(...)` を `ctx.timers.setTimeout(...)` に置換する。
  - src/views/panel-sections-layout.ts:390 (`setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)`)
  - src/views/coord-panel.ts:426 (highlight color reset, 600ms)
  - src/views/coord-panel.ts:444 (autoOptimize button re-enable, waitMs)
  - src/views/PanelBuilder.ts:1385 (`setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)`)
  coord-panel.ts に PanelContext (または ManagedTimers) が渡っていない場合は、関数シグネチャに追加し、呼び出し元 (PanelBuilder.ts または panel-sections-layout.ts) で `ctx` を伝播させる。GOD OBJECT である PanelBuilder.ts は行数を増やさないこと (置換のみ、新規行追加は最小に)。
  受け入れ基準:
  - 上記4ファイルの該当箇所が `ctx.timers.setTimeout` 化
  - `pnpm test`, `pnpm lint`, `pnpm build` 通過
  - `src/views/PanelBuilder.ts` の行数が 2216 を超えていない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
