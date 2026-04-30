## Description (subtask of 1499-settimeout-leaks)

src/views/panel-widgets.ts の以下 5 行の raw `setTimeout` を、関数引数として渡される `timers: ManagedTimers` 経由 (`timers.setTimeout(...)`) に書き換える:
  - line 209: input blur 時の popup hide (150ms)
  - line 862: hint hide (timeout なし=0ms)
  - line 1069: input blur 時の hint dismiss
  - line 1226: rebuild deferral (50ms)
  - line 1260: dismiss deferral (200ms)

  対応する関数 (`attachQueryHint` 等) のシグネチャに `timers: ManagedTimers` を追加し、`PanelBuilder.ts` / `panel-sections-layout.ts` の呼び出し元で既存の `ctx.timers` を渡す。
  ManagedTimers は既存実装 (1ファイル63行) なので新規作成不要。
  検証: `pnpm test` の panel 関連テストが通ること、`pnpm build` が成功すること。grep で `src/views/panel-widgets.ts` から raw `setTimeout(` が消えていることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
