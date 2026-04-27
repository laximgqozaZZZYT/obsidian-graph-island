## Description (subtask of 1464-settimeout-leaks)

GraphViewContainer.ts と PanelBuilder.ts 内の setTimeout 呼び出しを精読し、
  破棄処理で clearTimeout されていない呼び出しを TimerRegistry.setTimeout 経由に
  置き換える。GraphViewContainer は private timerRegistry = new TimerRegistry()
  を保持し、既存の onunload() の末尾で this.timerRegistry.dispose() を呼ぶ。
  PanelBuilder も同様に既存の destroy/dispose ハンドラへ dispose() を追加する。

  God Object 行数制約 (GraphViewContainer.ts ≤ 8655, PanelBuilder.ts ≤ 2216) を
  必ず守る: `setTimeout(...)` 1行を `this.timerRegistry.setTimeout(...)` 1行に
  置き換える形にとどめ、行数を増やさない。新規フィールド宣言と dispose 呼び出しの
  追加分は、置換による行数中立を意識してまとめて挿入する。
  `pnpm lint` と `pnpm test` が緑であること、`pnpm build` が成功することを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
