## Description (subtask of 1700-hover-helpers-dead-code)

GraphViewContainer.ts:4250 の `_addLinkNeighbors(result, hId, hht)` を
  src/views/hover-helpers.ts へ純粋関数 `addLinkNeighborsToSet` として export する。

  Signature 案:
    export function addLinkNeighborsToSet(
      result: Set<string>,
      hId: string,
      hht: { forwardLinks: boolean; backlinks: boolean },
      hoverAdj: Map<string, string[]>,
      hoverHops: number,
      graphEdges: Iterable<GraphEdge>,
    ): void

  - 内部で `bfsNeighborSet` を import して使う (現行 GVC と同じ)。
  - GVC 側: `_addLinkNeighbors` 本体を削除し、呼び出し箇所 (line 4226) を
    `addLinkNeighborsToSet(result, hId, hht, this.hoverAdj, this.panel.hoverHops, this.graphEdges)`
    に置換。
  - tests/views/hover-helpers.test.ts に 5 件以上の test case を追記:
    1) forwardLinks=true & backlinks=true で BFS 結果全件
    2) forwardLinks のみで in-edge 方向の隣接が除外される
    3) backlinks のみで out-edge 方向の隣接が除外される
    4) hops=0 のとき何も追加されない
    5) hoverAdj に hId が無いケースで例外なく空のまま戻る
  - 既存 GVC の挙動を変えないこと (regression 検出のため tests を先に書いてから extract)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
