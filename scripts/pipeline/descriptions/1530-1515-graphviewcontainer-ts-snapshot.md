## Description (subtask of 1515-autonomous-stalled-dirty-skip)

CLAUDE.md の Decomposition Priority 1 に従い、GraphViewContainer.ts(8652行/Max 8655)から
  snapshot 関連ロジックのみを切り出す。

  手順:
  1. src/views/GraphViewContainer.ts を精読し、snapshot に関するメソッドと
     state 直列化/復元関数を特定する(createSnapshot / applySnapshot / saveSnapshot /
     restoreSnapshot 等の名称をまず grep し、依存している純粋関数を芋づる式に確認)。
  2. 純粋関数として切り出せる部分(node/edge/settings の dump/load など、Obsidian API や
     PIXI に依存しないもの)を src/views/snapshot/snapshot-serializer.ts に移動。
     副作用のあるメソッド(this.app.* / this.pixi.* を触るもの)は GraphViewContainer.ts に残し、
     新ファイルの純粋関数を呼ぶ薄いラッパに変更する。
  3. tests/views/snapshot-serializer.test.ts に純粋関数のユニットテストを追加。
     最低5ケース(空グラフ / 通常 / nodes のみ / edges のみ / 不正 JSON 復元)。
  4. GraphViewContainer.ts の行数が現在より純減することを git diff で確認。
     CLAUDE.md の Max Allowed = 8655 を超えないこと(理想的には抽出した分だけ減らす)。
  5. pnpm test, pnpm lint, pnpm format:check を通す。

  GOD OBJECT Policy: ratchet down only。新規ファイルを作るのみで他 god object に
  ロジックを動かしてはならない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
