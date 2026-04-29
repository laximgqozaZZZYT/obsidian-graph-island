## Description (subtask of 1499-settimeout-leaks)

以下の5箇所の raw `setTimeout(...)` を ManagedTimers 経由に置換する。
  既存の同ファイル内で `ctx.timers.setTimeout` または `host.timers.setTimeout`
  を使っているコールサイトと同じパターンを踏襲すること。

  対象:
  - src/views/PanelBuilder.ts:1385  `setTimeout(() => cb.setZoom?.(...), 500)` → `ctx.timers.setTimeout(...)` (同関数内の line 1330/1346 と同様の書き方)
  - src/views/panel-sections-layout.ts:390  `setTimeout(() => cb.setZoom?.(...), 500)` → `ctx.timers.setTimeout(...)` (この関数のシグネチャに ctx が渡っていなければ同ファイル line 242/675/782 と同様に `let timer: ReturnType<typeof setTimeout> | undefined` で保持し、関数の teardown フックで clear)
  - src/views/panel-callbacks.ts:113  markDirty 内の `setTimeout(() => host.renderPipeline?.forceRender(), 100)` → `host.timers.setTimeout(...)` (PanelCallbackHost に `timers: ManagedTimers` を追加し、GraphViewContainer 側で `this.timers` をバインド)
  - src/views/coord-panel.ts:426  brief highlight 復帰 `setTimeout(..., 600)` → `ctx.timers.setTimeout(...)` (関数引数に既に ctx が渡っているか確認、無ければシグネチャ追加)
  - src/views/coord-panel.ts:444  optBtn re-enable `setTimeout(..., waitMs)` → `ctx.timers.setTimeout(...)`

  検証:
  - `pnpm test` 緑 (panel-builder 系既存テストが通ること)
  - `pnpm lint` 緑
  - GraphViewContainer.ts の destroy/onClose 経路で既に `this.timers.clearAll()` が呼ばれていることを確認 (現状の `_autoFitTimer`/`_doRenderDebounceTimer` clear と同じライフサイクル)
  - GOD OBJECT 行数を増やさないこと (PanelBuilder.ts の Max Allowed 2216 を超えない)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
