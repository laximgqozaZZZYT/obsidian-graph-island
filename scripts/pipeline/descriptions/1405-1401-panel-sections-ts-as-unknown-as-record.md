## Description (subtask of 1401-type-assertions)

`src/views/panel-sections.ts` の以下のパターンを解消する:
  - L138 `het as Record<string, boolean>`
  - L141 `(panel.hoverEdgeTypes as Record<string, boolean>)[key] = v`
  - L218-233 `v as NodeShape` 系（4箇所）
  - L269 `v as PanelState["nodeColorMode"]`
  - L593 / L666-674 `(panel as unknown as Record<string, unknown>)[key] = v`
    形式のダブルキャスト（計5箇所）

  方針:
  1. `EDGE_TYPE_KEYS` のような既知のキー集合に対する書き換えは、専用の
     `setEdgeTypeFlag(panel: PanelState, key: typeof EDGE_TYPE_KEYS[number],
     value: boolean)` ヘルパーを `src/views/panel-defaults.ts` ではなく
     panel-sections.ts 内のローカル関数として定義し、内側で 1 回の安全な
     代入に閉じ込める（`panel[key] = value` で済むよう `EDGE_TYPE_KEYS`
     を `as const` 配列にし、要素型を `keyof PanelState` の部分集合とする）。
  2. `NodeShape` / `nodeColorMode` 文字列キャストは、UI イベント側で
     `isNodeShape(v): v is NodeShape` 型ガードを `src/types.ts` または
     `src/views/panel-defaults.ts` に追加し、それを使って絞り込む。
  3. `het` への `Record<string, boolean>` キャストは、`het` の型が
     panel state 上で何であるかを精読して特定し、可能なら正しい型に置き換える
     （不明な場合はこのファイル内に最小限のローカル型定義を置く）。

  完了条件:
  - `grep -E " as [A-Z]| as unknown" src/views/panel-sections.ts | wc -l` の
    出力を 4件以下にする。
  - `pnpm build` と `pnpm test` がパス。
  - GOD OBJECT の `PanelBuilder.ts` を肥大化させない（追加するヘルパーは
    panel-sections.ts 内に閉じる）。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
