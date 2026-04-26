## Description (subtask of 065-e2e-smoke-fail)

e2e/smoke.spec.ts:87 周辺の "1-Data › baseline node count > 2000" テストを読み、
  期待される rawData ノード件数の取得経路 (buildGraphFromVault → rawData) を辿る。
  実 vault (/home/ubuntu/obsidian-plugins/開発/) に 2232 markdown が存在するため、
  rawData.nodes.length が 2000 未満になる原因を src/ 側で特定して修正する。
  - 候補1: metadata-parser.ts のスキャン除外条件が広すぎる
  - 候補2: GraphViewContainer の rawData アクセサ (CDP 経由で参照される値) の経路が
          getGraphData フィルタ後の値を返してしまっている
  src/ 側を読んでどちらが原因か確定し、原因のあるファイルだけを修正する。
  テスト本体 (smoke.spec.ts) の期待値は変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
