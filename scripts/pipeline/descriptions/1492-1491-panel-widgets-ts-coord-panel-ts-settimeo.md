## Description (subtask of 1491-settimeout-leaks)

対象7箇所(panel-widgets 5 + coord-panel 2)。
  手順:
  1. `src/views/panel-widgets.ts` 内の 5箇所の `setTimeout(...)` 呼び出しを精読し、各関数のシグネチャに `timers: ManagedTimers` パラメータを追加して `timers.setTimeout(...)` に置換。
  2. `src/views/coord-panel.ts` の 2箇所も同様に `timers: ManagedTimers` を受け取る形に変更。
  3. 呼び出し元の `src/views/PanelBuilder.ts` から、既存の `ManagedTimers` インスタンス(または GraphViewContainer 由来のもの)を引数で渡すようにする。新規インスタンス生成は不要、すでに保持しているものを共有。
  4. 該当ファイルの行数増加は最小限(シグネチャ追加と1ワード置換のみ)、`PanelBuilder.ts` も Max 2216 を超えないこと。
  5. `pnpm test` と `pnpm build` を通す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
