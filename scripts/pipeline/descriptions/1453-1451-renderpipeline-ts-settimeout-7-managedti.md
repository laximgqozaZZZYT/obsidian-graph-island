## Description (subtask of 1451-settimeout-leaks)

src/views/RenderPipeline.ts には 7件の `setTimeout(...)` があり、うち 5件が clearTimeout 未対応。
  enrichLabelsDeferred / processDeferredBatch / onAllPixiNodesCreated 系のタイマーが
  プラグイン disable 時に live のままになる。

  作業内容:
  1. RenderPipeline クラスのコンストラクタまたは init に `timers: ManagedTimers` 参照を受け渡す。
     GraphViewContainer.ts 側で `new RenderPipeline(..., this.timers)` の形で渡す。
  2. `import type { ManagedTimers } from "../utils/managed-timers"` を追加。
  3. ファイル内 7箇所の `setTimeout(...)` を `this.timers.setTimeout(...)` に置換。
     `_enrichmentCancelId` と `deferredBatchId` を保持している箇所は、ハンドル型が
     `ReturnType<typeof setTimeout>` のままで互換であることを確認。
  4. RenderPipeline 既存の `clearTimeout(this._enrichmentCancelId)` 等は `this.timers.clear(...)` に置換。
  5. `pnpm lint`、`pnpm test`、`pnpm build` を通す。
  6. GraphViewContainer.ts 行数が "Max Allowed" 8655 を超えないことを `wc -l` で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
