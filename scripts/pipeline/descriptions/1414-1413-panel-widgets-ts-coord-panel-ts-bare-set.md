## Description (subtask of 1413-settimeout-leaks)

src/views/panel-widgets.ts (setTimeout 5箇所, clearTimeout 0箇所) と
  src/views/coord-panel.ts (setTimeout 2箇所, clearTimeout 0箇所) の合計 7箇所の
  bare `setTimeout(...)` 呼び出しを `ManagedTimers` 経由に置換する。

  手順:
  1. 各ファイルの setTimeout 呼び出し位置を `Grep -n setTimeout\\(` で特定する
  2. これらの関数/ウィジェット作成側で `ManagedTimers` インスタンスを引数として
     受け取れるように signature を更新する。呼び出し元は `GraphViewContainer` /
     `PanelBuilder` の既存 ManagedTimers (`this.managedTimers` 等) を渡す。
     既存の ManagedTimers が無い場合は呼び出し元に1つ追加する。
  3. 各 `setTimeout(fn, ms)` を `managedTimers.setTimeout(fn, ms)` に置換する。
     fire-and-forget な短時間 timeout (例: 即時 focus 用 0ms) も含めて全て置換する
     (ManagedTimers は fire 後に自動 untrack するためリークしない)。
  4. 既存の動作 (タイミング・順序) を変えないこと。clear タイミングを増やす必要はなく、
     teardown 時の clearAll() が走るルートに乗せるのが目的。
  5. `pnpm lint` と `pnpm test` がグリーンであることを確認してコミット。

  CLAUDE.md God Object 制約: panel-widgets.ts / coord-panel.ts は God Object 対象外
  なので新規行追加は許容。ただし既存ロジックの大幅再構築はしない。

`★ Insight ─────────────────────────────────────`
- `ManagedTimers.setTimeout` は wrapper closure 内で fire 後に `handles.delete()` するため、単発タイマーでも leak free。bare setTimeout を機械的に置換するだけで teardown 漏れが解消する。
- panel-widgets.ts と coord-panel.ts は God Object 対象外で純度が高いので、最初に着手すべき低リスクなタスク。
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
