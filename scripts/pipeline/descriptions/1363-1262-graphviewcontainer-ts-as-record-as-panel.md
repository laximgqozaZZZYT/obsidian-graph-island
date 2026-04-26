## Description (subtask of 1262-type-assertions)

GraphViewContainer.ts 内に残った型アサーション約 50 箇所を以下の方針で削減:
    1. "as Record<string, ...>" (GVC内での発生箇所を grep で特定): Object.entries 等で取得した値は、
       元のオブジェクト側に index signature を持つ interface を定義し、`as` 不要にする。
       例: interface PanelStateRecord { [key: string]: unknown } → 型を絞る関数を1つ追加。
    2. "as PanelState" (15箇所のうち GVC 由来分): src/views/panel-state.ts (なければ作成) に
       buildDefaultPanelState() を抽出し、デフォルト値オブジェクトに正しい型注釈を付け、
       生成側で as を不要にする。
    3. "as GraphNode" (6箇所): isGraphNode(value): value is GraphNode の型ガード関数を
       src/utils/graph-helpers.ts に追加し、cast を type guard 経由に置換。
  目標削減: GraphViewContainer.ts の as 数を 81 → 30 以下 (約 50 削減)。
  GraphViewContainer.ts の行数が Max Allowed (8655) を超えないように、抽出先は別ファイル (panel-state.ts, graph-helpers.ts) に置く。
  pnpm test と pnpm lint がパスすること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
