---
priority: medium
reported: 2026-04-15
status: done
source: decomposed
parent: 133-type-assertions
depends: subtask-1（PanelState型定義の変更後に実施）
summary: enum/union型キャストの型ガード化（NodeShape, ClusterArrangement等 約25箇所除去）
---

## Description (subtask of 133-type-assertions)

string → enum/unionリテラル型への `as` キャストを型ガード関数で置換。
  1. `src/types.ts` に型ガードを追加:
     - `isNodeShape(v: string): v is NodeShape`
     - `isClusterArrangement(v: string): v is ClusterArrangement`
     - `isCurveKind(v: string): v is CurveKind`
     - `isNodeDisplayMode(v: string): v is NodeDisplayMode`
     - `isMatrixSortMode(v: string): v is MatrixSortMode`
     - `isBoolOp(v: string): v is BoolOp`
  2. panel-sections*.ts の `v as NodeShape` 等をガード関数で置換（UIセレクタのonChange等）
  3. edge-draw-config.ts, matrix-renderer.ts の同様パターンも置換
  4. 各型ガードのユニットテスト追加（tests/types.test.ts）
  想定除去数: ~25

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
