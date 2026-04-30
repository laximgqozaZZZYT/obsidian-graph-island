## Description (subtask of 1431-type-assertions)

`src/utils/type-guards.ts` を新規作成し、以下の型ガード関数を追加する:
  - `isNodeShape(v: unknown): v is NodeShape` — types.ts の NodeShape ユニオン全リテラルを判定
  - `isClusterArrangement(v: unknown): v is ClusterArrangement`
  - `isSortKey(v: unknown): v is SortKey`
  - `isCardText(v: unknown): v is CardText`
  - 各ガードに対応する `coerceXxx(v, fallback)` 形式の安全変換ヘルパー
  
  panel-defaults.ts (19箇所) / panel-sections.ts (13箇所) / panel-sections-node-display.ts (5) /
  panel-sections-edge-display.ts (6) / panel-sections-layout.ts (4) を精読し、`as NodeShape` /
  `as ClusterArrangement` / `as SortKey` / `as CardText` の cast を上記 coerceXxx に置換する。
  Record<string, unknown> 等の境界 cast は対象外 (今回は触らない)。
  
  検証: `pnpm test`、`pnpm lint`、`pnpm build`。grep で対象 cast の減少件数を確認。
  GraphViewContainer.ts は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
