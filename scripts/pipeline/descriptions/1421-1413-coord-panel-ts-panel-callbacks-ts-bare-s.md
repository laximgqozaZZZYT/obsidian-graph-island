## Description (subtask of 1413-settimeout-leaks)

`src/views/coord-panel.ts` 内の bare `setTimeout` 2箇所と、`src/views/panel-callbacks.ts` 内の 1箇所を `ManagedTimers` 経由に置き換える。
  対象行（現状）:
    - coord-panel.ts:426: highlight 復帰用 `setTimeout(() => { nameEl.style.color = ""; }, 600)`
    - coord-panel.ts:444: auto-optimize ボタン復活 `setTimeout(() => { ... }, waitMs)`
    - panel-callbacks.ts:113: `markDirty` 内 `setTimeout(() => { host.renderPipeline?.forceRender(); }, 100)`

  実装方針:
    - coord-panel.ts: `buildExpressionLibraryUI` / `buildCoordPanel` 等の対象関数が受け取る `panel: PanelState`, `cb: PanelCallbacks` 周辺の引数に `timers: ManagedTimers` を追加（呼び出し元 PanelBuilder.ts から `ctx.timers` を渡す）。`setTimeout(...)` を `timers.setTimeout(...)` に置換。
    - panel-callbacks.ts: `PanelCallbackHost` に `timers: ManagedTimers` フィールドを追加（GraphViewContainer は `this.timers` を保持済み）。`setTimeout(...)` を `host.timers.setTimeout(...)` に置換。
    - 必要な import: `import type { ManagedTimers } from "../utils/managed-timers";`

  検証:
    - `pnpm build` 成功
    - `pnpm test` 既存テスト通過
    - `pnpm lint` 通過
    - `grep -c "setTimeout(" src/views/coord-panel.ts src/views/panel-callbacks.ts` で bare setTimeout が 0 になることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
