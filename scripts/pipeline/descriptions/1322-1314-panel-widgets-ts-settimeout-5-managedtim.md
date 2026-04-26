## Description (subtask of 1314-settimeout-leaks)

src/views/panel-widgets.ts の以下5箇所の `setTimeout(...)` を、PanelContext.timers (ManagedTimers) 経由の `ctx.timers.setTimeout(...)` に置き換える。
  - 209行目: popup hide (150ms)
  - 862行目: 詳細不明 — 該当関数を読んで内容確認
  - 1069行目: 詳細不明 — 該当関数を読んで内容確認
  - 1226行目: `setTimeout(ctx.rebuild, 50)` の rebuild ディスパッチ
  - 1260行目: `setTimeout(ctx.dismiss, 200)` の dismiss ディスパッチ
  各 widget 関数のシグネチャに `ctx: PanelContext` または `timers: ManagedTimers` 引数が無い場合は追加し、PanelBuilder.ts 側の呼び出しも更新する (PanelBuilder.ts は `ctx` を保持しているので渡すだけ)。
  受け入れ基準:
  - panel-widgets.ts 内の生 `setTimeout(` 呼び出しが0件
  - `pnpm test` 通過
  - `pnpm lint` 通過

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
