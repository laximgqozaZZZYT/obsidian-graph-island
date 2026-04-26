## Description (subtask of 1328-settimeout-leaks)

RenderPipeline.ts には setTimeout が 12 箇所あるが clearTimeout は 2 箇所のみで
  10 箇所が破棄時に未クリア。src/utils/managed-timers.ts の ManagedTimers を
  RenderPipeline 内に private フィールドとして 1 つ保持し、生 setTimeout 呼び出しを
  this._timers.setTimeout(...) に置換する。RenderPipeline.destroy() (もしくは破棄相当
  メソッド) の末尾に this._timers.clearAll() を追加する。
  既存の clearTimeout 2 箇所はハンドル経由なので this._timers.clear(handle) に置換する。
  注意: RenderPipeline.ts は God Object (Max 2476 行)。新規ヘルパー追加で総行数は
  必ず据え置きまたは減らすこと。フィールド追加と置換のみで完結させる。
  検証: `pnpm test`、`grep -c 'setTimeout(' src/views/RenderPipeline.ts` の生 setTimeout が
  ManagedTimers 経由のみになっていることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
