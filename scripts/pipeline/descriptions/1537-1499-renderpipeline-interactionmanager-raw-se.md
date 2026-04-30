## Description (subtask of 1499-settimeout-leaks)

既存の `deferredBatchId` / `_enrichmentCancelId` / `_zoomCullTimer` /
  `_zoomLayoutTimer` パターンに合流させ、destroy 経路で必ず clear する。

  対象:
  - src/views/RenderPipeline.ts:1488  `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)`
    → 新フィールド `private _onAllNodesCreatedTimer: ReturnType<typeof setTimeout> | null = null;`
    に保存し、destroy/dispose 系メソッド (line 1850 付近の clear 群と同箇所) で
    `if (this._onAllNodesCreatedTimer) clearTimeout(this._onAllNodesCreatedTimer);` を追加。
    fire 時は handle を null に戻す。
  - src/views/RenderPipeline.ts:1786  `setTimeout(() => this.enrichLabelsDeferred(), 2500)`
    → 既存 `_enrichmentCancelId` を再利用するか、新規 `_enrichmentKickoffTimer` フィールドを追加して同じ destroy で clear。
  - src/views/InteractionManager.ts:1055  search コマンド連携の `setTimeout(..., 300)`
    → 新フィールド `private _searchOpenTimer: ReturnType<typeof setTimeout> | null = null;`
    に保存し、line 371-372 付近の clear 群に
    `clearTimeout(this._searchOpenTimer);` を追加。

  検証:
  - `pnpm test` 緑 (RenderPipeline / InteractionManager のユニットテストが通ること)
  - `pnpm lint` 緑
  - GOD OBJECT 行数を増やさないこと (RenderPipeline.ts Max Allowed 2657, EdgeRenderer.ts 等は触らない)
  - destroy 後に新フィールドの handle が null になることを既存テスト or 新規ユニットテストで確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
