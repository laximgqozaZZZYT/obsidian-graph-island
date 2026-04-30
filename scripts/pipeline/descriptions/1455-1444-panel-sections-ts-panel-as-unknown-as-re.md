## Description (subtask of 1444-type-assertions)

panel-sections*.ts に頻出する以下のパターン (合計15+箇所、内訳は調査後に確定):
    (panel as unknown as Record<string, unknown>)[key] = v
    const cur = (panel as unknown as Record<string, unknown>)[key]
  を、新規に作成する src/views/panel-state-helpers.ts (新規ファイル) の
  ジェネリック関数で置換する:
    export function getPanelKey<K extends keyof PanelState>(
      panel: PanelState, key: K
    ): PanelState[K]
    export function setPanelKey<K extends keyof PanelState>(
      panel: PanelState, key: K, value: PanelState[K]
    ): void
  EDGE_TYPE_KEYS のループ書き込みは `K extends keyof PanelState` を保証するため
  `EDGE_TYPE_KEYS: readonly (keyof PanelState)[]` の型を確認 / 修正する。
  v as NodeShape など値側のキャストはこのタスクの対象外 (別タスクで扱える)。
  PanelBuilder.ts (1719行 god object) は触らないこと — helper は別ファイル新規作成。
  事後確認: pnpm build / pnpm test / pnpm lint 緑、対象4ファイルの
  `as unknown as Record` 出現数が0になること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
