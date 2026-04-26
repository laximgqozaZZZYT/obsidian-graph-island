
## Description (subtask of 1205-145-cluster-force-ts-export)

src/layouts/cluster-force.ts で以下の arrangement 関数に `export` を追加:
  - `concentricOffsets(p: ArrangementParams)` (L2739)
  - `gridOffsets(p: ArrangementParams)` (L2849)
  - `triangleOffsets(p: ArrangementParams)` (L2900)
  - `randomOffsets(p: ArrangementParams)` (L3077)

  ArrangementParams / ArrangementResult 型も export 必要なら追加 (既存であれば再利用)。

  tests/cluster-force-pure.test.ts に 4件以上追加:
  - concentricOffsets: 空ノード / 1ノードが中心 / 複数リング境界
  - gridOffsets: 1x1 / 2x2 / 縦長配置
  - triangleOffsets: 頂点数=3 境界 / 大量ノード
  - randomOffsets: 決定性（同じ seed で同じ結果）または range 検証

  副作用禁止 — 戻り値の Map/object のみで検証する。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
