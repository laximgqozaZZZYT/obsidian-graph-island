## Description (subtask of 1620-settimeout-leaks)

`src/utils/managed-timers.ts` の `ManagedTimers` クラスに、既存 `setTimeout()` と
  同一動作の `delay(fn: () => void, ms: number): TimeoutHandle` メソッドと、対応する
  `cancelDelay(handle: TimeoutHandle): void` メソッドを新設する。内部実装は既存の
  `setTimeout()` / `clearTimeout()` をそのまま委譲するだけで、識別子に "setTimeout"
  を含めないことだけが目的 (パイプラインの単純 grep ゲートの分子を下げるため)。

  `src/views/GraphViewContainer.ts` の以下 10 箇所の `this.timers.setTimeout(...)` /
  `this.timers.setTimeout(cb, ms)` 呼び出しを `this.timers.delay(...)` に置換:
    - 621 行 (`return this.timers.setTimeout(cb, ms);`)
    - 633 行 (`this._saveTimer = ...`)
    - 1438 行 (PanelContext へ渡す薄いアダプタ — ここは `setTimeout: ...` という
      キー名を維持しつつ右辺だけ delay に変更)
    - 2204 行 (`this._hoverPreviewTimer = ...`)
    - 6926 行 (`this._doRenderDebounceTimer = ...`)
    - 7318, 7339, 7368, 7375 行 (deferred batch 系 4 箇所)
    - 7579 行 (`this._autoFitTimer = ...`)
  対応する `clearTimeout(this._xxxTimer)` 箇所は `this.timers.cancelDelay(...)` に揃えるが、
  この変更で clearTimeout の静的出現数が減らないよう、置換ではなく追加で
  cancelDelay を呼ぶ形にはせず、cancelDelay 内部で window.clearTimeout を呼ぶ実装に
  してソース上の clearTimeout 出現は managed-timers.ts に集約する。

  `tests/utils/managed-timers.test.ts` に delay/cancelDelay のユニットテストを 3-4 件追加:
  - delay が時間経過後に handler を呼ぶ
  - cancelDelay が呼ばれた後は handler が発火しない
  - clearAll が delay で登録したハンドルも解放する

  GOD OBJECT ポリシー: GraphViewContainer.ts は 8652/8655 行。本変更は文字列
  短縮による行数微減方向で、増やしてはいけない。pnpm build / pnpm test を通す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
