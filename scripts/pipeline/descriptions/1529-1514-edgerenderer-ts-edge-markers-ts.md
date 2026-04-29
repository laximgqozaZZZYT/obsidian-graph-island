## Description (subtask of 1514-autonomous-stalled-dirty-skip)

src/views/EdgeRenderer.ts の以下の private 関数群 (2509-2790 行付近) を
  新規ファイル src/views/edge-markers.ts に切り出し、EdgeRenderer 側は import で参照する。

  対象関数 (EdgeRenderer.ts 内):
  - drawEdgeMarker            (2509- )
  - drawSequenceArrow         (2558- )
  - drawGenericArrow          (2585- )
  - resolveCardinality        (2632- )
  - getDefaultCardinality     (2645- )
  - drawCardinalityMarker     (2673- )

  手順:
  1. 新規ファイル src/views/edge-markers.ts を作成し、6 関数を `export function`
     として移動する。型 (CardinalityRule, GraphEdge, Pos, CanvasGraphics) は既存の
     共有型ファイルから import する (新たな型定義は作らない)。
  2. EdgeRenderer.ts の上部 import 群に
     `import { drawEdgeMarker, drawSequenceArrow, drawGenericArrow, resolveCardinality, getDefaultCardinality, drawCardinalityMarker } from "./edge-markers";`
     を追加。元ファイル側の関数定義は完全削除。
  3. CLAUDE.md の EdgeRenderer.ts Max Allowed を実測値に合わせて再度 ratchet down。
  4. `pnpm build && pnpm lint && pnpm test` 実行で全 PASS を確認。

  注意:
  - subtask-1 と同じ EdgeRenderer.ts を編集するため、subtask-1 完了後に着手すること(並列禁止)。
  - drawCardinalityMarker は CardinalityRule 型に依存。型は import 元を変えない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
