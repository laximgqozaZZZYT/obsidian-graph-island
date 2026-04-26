## Description (subtask of 1340-graph-settings-cleanup)

座標レイアウトの "table" グリッドスタイルは UI が存在するが
  実利用されていない/期待動作と乖離しているため削除する。
  - src/views/panel-defaults.ts: 118行 の gridStyle: "lines" デフォルトを削除。
  - src/views/PanelBuilder.ts: 223行 の gridStyle 型フィールドを削除。
  - src/views/panel-sections-layout-helpers.ts: 50-65行 (gridTableMode セクション) と
    72-83行 (gridStyle セレクタ) のセクション全体を削除。
  - src/utils/presets.ts: 123行 の "gridStyle" キーを削除。
  - src/i18n.ts: 364-368行 (英) と 1341-1345行 (日) の guide.gridStyle*/gridTableMode*
    のキー5+5件を削除。
  - src/layouts/coordinate-engine.ts: 831/840/850/1004/1010/1103/1114/1150/1200/1225行
    周辺で "table" 分岐と gridStyle 引数連鎖を削除し、関数シグネチャを単純化
    (resolveCategoryGridPositions 等)。"lines" 動作のみを残す。
  - tests/layouts/coordinate-engine.test.ts の gridStyle="table" 関連ケースを削除。
  完了条件: grep -rn "gridStyle\|gridTableMode" src/ tests/ がヒット 0件、
  pnpm test と pnpm build が通ること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
