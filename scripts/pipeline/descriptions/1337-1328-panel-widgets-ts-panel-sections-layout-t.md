## Description (subtask of 1328-settimeout-leaks)

panel-widgets.ts (5 setTimeout / 0 clearTimeout)、panel-sections-layout.ts
  (7/3、ギャップ 4)、panel-callbacks.ts (1/0) の生 setTimeout 呼び出しを
  src/utils/timer-registry.ts の TimerRegistry 経由に置換する。
  これら 3 ファイルは関数群で内部状態を持たないため、引数に既存の TimerRegistry
  インスタンス (GraphViewContainer/PanelBuilder が保持しているもの) を受け取る形で
  signature を拡張する。呼び出し側 (PanelBuilder.ts) で既存 registry を渡す。
  registry が未提供のレガシー呼び出しが残る場合は、当該ファイル冒頭に
  module-scoped TimerRegistry を 1 つ用意し export する clearAll 関数を追加し、
  GraphViewContainer の destroy 経路から呼ぶ。
  検証: `pnpm test`、`pnpm lint`、3 ファイルの生 setTimeout 件数が 0 になっていること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
