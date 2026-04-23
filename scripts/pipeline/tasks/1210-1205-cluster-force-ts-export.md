---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1205-145-cluster-force-ts-export
depends: none
summary: cluster-force.ts から算術ユーティリティ系の純粋関数を export し境界値テスト追加
---

## Description (subtask of 1205-145-cluster-force-ts-export)

src/layouts/cluster-force.ts から以下の純粋関数を `export` キーワード付与のみで公開する (シグネチャ変更禁止):
    - `backlinkBucket(deg: number): string` (L2438)
    - `estimateGroupRadius(...)` (L2294)
    - `computeEffectiveColumnSpacing(...)` (L1538)
    - `getSpacing(id: string, map?: Map<string, number>): number` (L945)
    - `normalizeSpread(...)` (L2574) — 引数→戻り値で完結するか確認の上、純粋なら export
  
  tests/layouts/cluster-force.test.ts (無ければ新規作成) に 6 件以上の境界値テストを追加:
    - backlinkBucket: deg=0 / deg=1 / deg=5 / deg=20 / 負値 の 5 区分カバー
    - estimateGroupRadius: 空グループ、単一ノード、複数ノードの半径単調増加
    - getSpacing: map=undefined fallback、map空、map有効キー、無効キーの fallback
  
  既存の export シグネチャは一切変更しないこと。GOD OBJECT 方針に従い、cluster-force.ts 内でのロジック新規追加は禁止 (export キーワード付与のみ)。
  完了後 `pnpm test tests/layouts/cluster-force.test.ts` と `pnpm lint` が通ることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
