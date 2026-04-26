
## Description (subtask of 141-coverage-drop)

`src/utils/snapshot.ts` には `fnv1a`, `hashMeta`, `captureSnapshot`, `edgeKey`, `computeSnapshotDiff`, `computeSnapshotToSnapshotDiff` の 6 export がある。
  既存 `tests/snapshot.test.ts` を読み、呼ばれていない関数・分岐を特定して追加ケースを足す。特に:
  - `hashMeta(undefined)` / 空オブジェクト / キー並び順違いで同一ハッシュ
  - `edgeKey` の source/target 逆順でキー差異
  - `computeSnapshotToSnapshotDiff` の added / removed / modified 3 ケース
  - `captureSnapshot` 出力の各フィールド存在
  新規 export は追加しない (既存関数の coverage 穴埋めのみ)。`describe` ブロックを追加する形で既存テストと共存させる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
