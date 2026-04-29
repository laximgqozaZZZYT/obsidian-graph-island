## Description (subtask of 1514-autonomous-stalled-dirty-skip)

src/views/EdgeRenderer.ts の以下の private 関数群 (1984-2169 行付近) を
  src/views/CableTrayRenderer.ts に移管し、EdgeRenderer 側はその新規 export を
  import して使う形に切り替える。挙動変更なしの純抽出のみ。

  対象関数 (EdgeRenderer.ts 内):
  - prepareBundles            (1984- )
  - invalidateCableCacheIfNeeded (2005- )
  - rebuildTrunkCables        (2021- )
  - prepareCables             (2060- )
  - drawCables                (2134- )

  手順:
  1. 各関数をシグネチャごと CableTrayRenderer.ts に移し、`export` を付与する
     (引数で必要な依存 — EdgeDrawConfig, EdgeRenderCache, GraphEdge[], BundleGroup 等 — は既に CableTrayRenderer 側で型定義済みなので追加 import は最小限)。
  2. EdgeRenderer.ts 上部の `from "./CableTrayRenderer"` import block に
     5 関数を追加する。元ファイル側の関数定義は完全削除 (コメントアウトで残さない)。
  3. これにより EdgeRenderer.ts の行数が 2765 → 約 2580 前後に縮む見込み。
     CLAUDE.md の Max Allowed (2765) を **下げる方向** に再調整する:
     CLAUDE.md の EdgeRenderer.ts 行を実測値に合わせて更新 (ratchet down only)。
  4. `pnpm build && pnpm lint && pnpm test -- EdgeRenderer` を実行し、
     既存の EdgeRenderer 関連ユニットテスト (drawEdges/getDashPattern/computeDensityScale 等) が全件 PASS することを確認。
  5. 新たなテストは追加しない (純抽出なので既存テストでカバー)。

  注意:
  - EdgeRenderer.ts 内の他関数 (drawEdges 本体, drawEdgeSegment 等) は触らない。
  - CableTrayRenderer.ts のサイズ増加は許容 (Max Allowed なし)。
  - 関数名・引数順は変更禁止。リネームするとテストが落ちる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
