---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 145-coverage-drop
depends: none
summary: cluster-force.ts の純粋関数を export し境界値テストを追加
---

## Description (subtask of 145-coverage-drop)

src/layouts/cluster-force.ts (現在 stmt 57.8% / fn 61.2%, 648行未カバー) から純粋関数を特定し export。
  - クラスタ重心計算、ノードグルーピング、反発力計算など、引数→戻り値で完結するヘルパーを export
  - tests/layouts/cluster-force.test.ts に境界値テストを10件以上追加
    - 空配列、単一ノード、単一クラスタ、多クラスタ
    - クラスタ重心が幾何中心と一致するか
    - 反発力ベクトルの単調性（距離が近いほど強い）
  - 既存シグネチャは変更せず追加 export のみ
  - GOD OBJECT 肥大化禁止ルール遵守（cluster-force.ts は god object ではないが最小限の追加に留める）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
