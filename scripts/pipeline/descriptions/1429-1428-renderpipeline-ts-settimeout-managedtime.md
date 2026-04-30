## Description (subtask of 1428-settimeout-leaks)

src/views/RenderPipeline.ts には setTimeout が 12 箇所、clearTimeout が 2 箇所しかなく、
  差分 10 が最大の未クリア源。以下を実施する:
  1. RenderPipeline クラスに `private readonly _timers = new ManagedTimers();` フィールドを追加
     (既存の src/utils/managed-timers.ts の ManagedTimers をそのまま利用)
  2. ファイル内の 12 箇所の生 `setTimeout(...)` 呼び出しを `this._timers.setTimeout(...)` に置換
  3. 既存の `clearTimeout(handle)` 呼び出し 2 箇所を `this._timers.clear(handle)` に置換
  4. RenderPipeline の destroy / dispose 系メソッド (存在しなければ既存の cleanup フックに追加)
     で `this._timers.clearAll()` を呼ぶ
  5. ロジック変更は禁止 (1:1 置換のみ)。タイマー発火順や ms 値は変えない。
  6. RenderPipeline.ts は GOD OBJECT で Max Allowed 2657。行数を増やさないこと。
  7. `pnpm test` と `pnpm lint` がパスすること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
