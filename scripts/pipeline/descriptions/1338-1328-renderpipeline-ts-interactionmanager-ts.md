## Description (subtask of 1328-settimeout-leaks)

以下の 4 箇所の生 setTimeout を、既存の ManagedTimers 経由に置き換えて
  unload 時に確実に clearTimeout が呼ばれるようにする。

  対象 (現状):
  - src/views/RenderPipeline.ts L1488: `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)`
  - src/views/RenderPipeline.ts L1786: `setTimeout(() => this.enrichLabelsDeferred(), 2500)`
  - src/views/InteractionManager.ts L1055 付近: `setTimeout(() => { ... obsApp.workspace.getLeavesOfType("search") ... }, 300)`
  - src/views/panel-callbacks.ts L113: `setTimeout(() => { host.renderPipeline?.forceRender(); }, 100)`

  変更方針:
  - RenderPipeline は `this.host.timers` (GraphViewContainer 由来の ManagedTimers) を使えるなら
    `this.host.timers.setTimeout(...)` に置換。アクセスできない場合は RenderPipeline に
    `private _postCreateTimer: TimeoutHandle | null = null` / `_enrichKickoffTimer` を追加し、
    既存 `clearTimeout(this.deferredBatchId)` 系と同じパターンで teardown ロジックに
    `clearTimeout` を追加する (新規ファイル作成不要、行数追加は最小限)。
  - InteractionManager は既に `this._zoomLayoutTimer` 系で `window.setTimeout` + `clearTimeout` を
    やっているので、L1055 の searchJump 用に `_searchJumpTimer` フィールドを追加し、
    既存の dispose / teardown で `clearTimeout(this._searchJumpTimer)` を呼ぶ。
  - panel-callbacks.ts L113 は `host.timers.setTimeout(...)` に置換 (host は GraphViewContainer)。

  完了条件:
  - 上記 4 箇所すべてが ManagedTimers 経由 もしくは メンバ変数で追跡され dispose/onunload で clearTimeout される
  - `pnpm lint` / `pnpm test` がグリーン
  - GOD OBJECT (RenderPipeline 2476, InteractionManager) の行数を増やさない (差分は ±5 行以内、
    Max Allowed を絶対に超えない)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
