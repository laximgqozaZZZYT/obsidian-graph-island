## Description (subtask of 1640-settimeout-leaks)

`src/views/panel-widgets.ts` の以下5ヶ所の raw `setTimeout(` を、その関数が受け取る `ctx`（PanelContext）の `ctx.timers.setTimeout(...)` に置換する。
  - 209行目: `setTimeout(() => (popup.style.display = "none"), 150);`
  - 862行目: `setTimeout(() => { ... });`
  - 1069行目: `setTimeout(() => { ... });`
  - 1226行目: `setTimeout(ctx.rebuild, 50);`
  - 1260行目: `setTimeout(ctx.dismiss, 200);`
  
  作業手順:
  1. 各 call-site のスコープで `ctx` (PanelContext) または `panel.timers` などの timers が利用可能か確認する
  2. 利用できる場合は `ctx.timers.setTimeout(fn, ms)` に置換
  3. 関数シグネチャに ctx が無い場合のみ、関数引数に ctx を追加するのではなく、`PanelContext` 由来の timers を渡す既存 helper を使用
  4. 行数の増加はゼロを目指す（純粋な API 置換）
  5. `pnpm test` がグリーンのままであることを確認
  
  godobj 制約: panel-widgets.ts は God Object 対象外。lint/format 通過を確認するのみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
