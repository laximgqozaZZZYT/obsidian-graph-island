## Description (subtask of 1393-type-assertions)

panel-sections 系 6 ファイルに `v as NodeShape`, `v as PanelState["nodeColorMode"]`,
  `v as "all" | "bidirectional" | "unidirectional"`,
  `(panel as unknown as Record<string, unknown>)[key] = v` 等のキャストが
  合計 ~33 件ある。コールバックから渡る `v: unknown` を panel フィールドへ
  代入する箇所が大半。
  対応:
  1. `src/views/panel-state-setter.ts` を新設し、
     `setPanelField<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K]): void`
     と、unknown → 特定 union への narrowing helper
     (`asNodeShape(v: unknown): NodeShape | null` 等) を実装。
  2. ドロップダウン/トグル callback で `v as NodeShape` のようにしていた
     箇所を `const shape = asNodeShape(v); if (!shape) return;` に置換。
  3. `(panel as unknown as Record<string, unknown>)[key] = v` の動的代入は
     EDGE_TYPE_KEYS のように対象キー集合が決まっているので、
     `setEdgeTypeFlag(panel, k, on)` のような型付き helper を導入して撤去。
  4. 新ヘルパに対する単体テスト (tests/views/panel-state-setter.test.ts) を
     narrowing の境界値ごとに追加 (有効値 / 不正値 / null / undefined)。
  完了条件: 上記 6 ファイルの `as` 件数合計が ~33 → 10 以下、テスト追加+全緑。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
