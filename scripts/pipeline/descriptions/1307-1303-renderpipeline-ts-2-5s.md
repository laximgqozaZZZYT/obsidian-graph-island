## Description (subtask of 1303-settimeout-leaks)

src/views/RenderPipeline.ts の 1675 行目 `setTimeout(() => this.enrichLabelsDeferred(), 2500)`
  は ID を保持しておらず、view 破棄後にも発火し得る。

  変更内容:
  1. クラスに `private _labelEnrichKickoffId: ReturnType<typeof setTimeout> | null = null;` を追加
  2. 1675 行目の setTimeout を `this._labelEnrichKickoffId = setTimeout(...)` に変更し、
     コールバック内で `this._labelEnrichKickoffId = null` に戻す
  3. クラスに `destroy()` メソッド (既存があれば追記) を作り、
     - `_labelEnrichKickoffId` を clearTimeout
     - 既存の `_enrichmentCancelId` も同じロジックで clear (1738-1741 行目に
       既に cancelDeferredBatch があるので、それと同形式で labelEnrich 用も追加)
  4. GraphViewContainer 側 (RenderPipeline 所有元) の onunload 経路から destroy() を呼ぶ。
     既存の dispose/teardown 経路があるか Read で確認し、無ければ既存の
     cancelDeferredBatch 呼び出し箇所と同じところに追記。

  RenderPipeline.ts の Max Allowed は 2476 行。本タスクで +20 行以内に収めること。
  追加できなければ、既存の cancelDeferredBatch を `cancelAllPendingTimers` に
  リネームして中身に統合する形で行数を抑える。

  Acceptance:
  - clearTimeout 件数が src/views/RenderPipeline.ts で 2 → 4 以上に増える
  - `pnpm test` PASS
  - `pnpm lint` PASS

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
