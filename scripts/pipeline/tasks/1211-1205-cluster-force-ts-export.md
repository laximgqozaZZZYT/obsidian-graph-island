---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1205-145-cluster-force-ts-export
depends: subtask-1
summary: cluster-force.ts から配置オフセット計算の純粋関数を export し境界値テスト追加
---

## Description (subtask of 1205-145-cluster-force-ts-export)

src/layouts/cluster-force.ts から以下の配置計算関数を `export` キーワード付与のみで公開:
    - `concentricOffsets(p: ArrangementParams): ArrangementResult` (L2739)
    - `radialOffsets(p: ArrangementParams): ArrangementResult` (L2811)
    - `gridOffsets(p: ArrangementParams): ArrangementResult` (L2849)
    - `triangleOffsets(p: ArrangementParams): ArrangementResult` (L2900)
  `ArrangementParams` / `ArrangementResult` 型も必要なら export。
  
  tests/layouts/cluster-force.test.ts に 6 件以上の境界値テストを追加:
    - 各 offsets 関数: 空キー配列 → 空 Map 返却
    - 各 offsets 関数: 単一キー → 重心 (0,0) 付近に配置
    - gridOffsets: 4 ノード → 2x2 グリッド配置検証 (dx,dy の分布)
    - concentricOffsets: リング上のノード間距離が等しい (≒等分配置)
    - radialOffsets: ノード数増加時も重心平均が原点近傍に留まる (幾何中心一致)
    - triangleOffsets: 3 ノード時に正三角形の頂点配置
  
  計 subtask-1 と合わせて 12 件以上の新規テストとなり、Acceptance criteria の 10 件以上要件を満たす。
  シグネチャ変更禁止、GOD OBJECT 肥大化禁止 (export 付与とテスト追加のみ)。
  完了後 `pnpm test` 全件 PASS と `pnpm lint` 通過、カバレッジ `pnpm test:coverage` で cluster-force.ts の stmt/fn が現状 57.8% / 61.2% から向上していることを確認。

`★ Insight ─────────────────────────────────────`
- subtask-1 を先に完了することで、`tests/layouts/cluster-force.test.ts` のファイル作成とインポート基盤が整う → subtask-2 は追記だけで済む
- 配置関数 (subtask-2) はテストで「重心が原点付近」「リング上等分」「正三角形」など**幾何的不変量**を検証できるため、境界値より性質ベーステストが強力
- `export` キーワード付与だけに留めることで diff が最小化され、既存の buildClusterForce から呼ばれている内部呼び出しは無変更 → リグレッションリスクがほぼゼロ
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
