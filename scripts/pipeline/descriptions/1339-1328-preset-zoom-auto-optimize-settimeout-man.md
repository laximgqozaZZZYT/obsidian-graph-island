## Description (subtask of 1328-settimeout-leaks)

PanelCallbacks 経由で発火する遅延コールバックを ManagedTimers 管理下に移す。

  対象 (現状):
  - src/views/coord-panel.ts L426: `setTimeout(() => { nameEl.style.color = ""; }, 600)` (highlight解除)
  - src/views/coord-panel.ts L444: `setTimeout(() => { optBtn.disabled = false; ... }, waitMs)` (auto-optimize完了)
  - src/views/panel-sections-layout.ts L390: `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)`
  - src/views/PanelBuilder.ts L1385: `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)`

  変更方針:
  - `PanelCallbacks` (src/views/PanelBuilder.ts に定義) に
    `scheduleTimeout: (fn: () => void, ms: number) => void` を追加する。
  - panel-callbacks.ts の `createPanelCallbacks(host)` で
    `scheduleTimeout: (fn, ms) => host.timers.setTimeout(fn, ms)` を実装する。
  - 上記 4 箇所を `setTimeout(...)` → `cb.scheduleTimeout(...)` に置換する。
  - 戻り値が必要な箇所は今回は無し (どれも fire-and-forget)。

  完了条件:
  - 4 箇所すべて `cb.scheduleTimeout` 経由になっている
  - `pnpm lint` / `pnpm test` グリーン
  - PanelBuilder.ts の Max Allowed (2216) を超えない
  - GOD OBJECT 政策に従い、PanelCallbacks 拡張は最小限 (+5 行以内)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
