## Description (subtask of 145-coverage-drop)

src/layouts/cluster-force.ts は coverage 58.99% (1534 stmt) で大きな未カバー領域がある。
  下記の export 済み純粋関数に既存テストファイル (tests/cluster-force-pure.test.ts または
  tests/layouts/cluster-force.test.ts) で境界値ケースを追加する:
    - concentricOffsets(p): 1ノード / 2ノード / 多ノード / params既定値の4ケース
    - gridOffsets(p): 1ノード / 4ノード(2x2) / 9ノード(3x3) / 7ノード(不揃い)
    - triangleOffsets(p): 1ノード / 3ノード / 6ノード / 10ノード
    - randomOffsets(p): seedありで決定的, 同seedで再現性, ノード数ゼロ
    - partitionNodes(nodes, groupBy, degrees): groupBy未設定 / 全ノード同グループ / 多グループ
    - backlinkBucket(deg): deg=0 / deg=1 / deg=境界 / 大きい値
  src/layouts/cluster-force.ts は変更しない。pnpm test が PASS することを確認しコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
