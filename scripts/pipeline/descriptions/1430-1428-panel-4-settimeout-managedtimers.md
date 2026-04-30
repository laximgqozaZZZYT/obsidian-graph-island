## Description (subtask of 1428-settimeout-leaks)

panel 系で未クリア setTimeout が集中している 5 ファイルをまとめて移行する。
  差分内訳: PanelBuilder (6 vs 1)、panel-widgets (5 vs 0)、panel-sections-layout (7 vs 3)、
  coord-panel (2 vs 0)、panel-callbacks (1 vs 0)。
  実施内容:
  1. PanelBuilder.ts に `private readonly _timers = new ManagedTimers();` を追加し、
     destroy / detach 系で `clearAll()` を呼ぶ。生 setTimeout 6 箇所を全て置換。
  2. 関数モジュール (panel-widgets.ts, panel-sections-layout.ts, panel-callbacks.ts,
     coord-panel.ts) は呼び出し側の PanelBuilder / GVC の ManagedTimers インスタンスを
     引数で受け取り、`timers.setTimeout(...)` を使う形にシグネチャを更新する。
     呼び出し側のコール箇所も併せて修正。
  3. 既存 clearTimeout 4 箇所も対応する `timers.clear(handle)` に置換。
  4. PanelBuilder.ts は GOD OBJECT (Max Allowed 2216)。行数増加禁止。1:1 置換に徹する。
  5. ロジック・タイミング・順序を変えないこと。
  6. `pnpm test` と `pnpm lint` がパスすること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
