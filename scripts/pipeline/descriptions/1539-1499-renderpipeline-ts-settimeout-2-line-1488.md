## Description (subtask of 1499-settimeout-leaks)

src/views/RenderPipeline.ts の以下 2 件の raw `setTimeout` をクラスメンバのハンドルに格納し、`destroy()`/`teardown()` 相当の解放経路で `clearTimeout` する:
  - line 1488: `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)` → 新規メンバ `_onAllNodesCreatedHandle: ReturnType<typeof setTimeout> | null` に格納
  - line 1786: `setTimeout(() => this.enrichLabelsDeferred(), 2500)` → 新規メンバ `_enrichmentTriggerHandle` に格納

  既存の `_enrichmentCancelId` / `deferredBatchId` が破棄経路で clear されているか合わせて確認し、未対応なら同じ destroy で clear 追加。
  RenderPipeline.ts (2657行) は God Object 上限値なので **行追加は最小限** (メンバ宣言+clear 数行のみ)、ロジック追加禁止。
  検証: `pnpm test` 全パス、`pnpm build` 成功、ファイル行数が 2657 を超えないこと (CLAUDE.md godobj policy)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
