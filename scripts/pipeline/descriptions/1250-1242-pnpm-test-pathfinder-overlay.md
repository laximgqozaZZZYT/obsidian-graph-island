
## Description (subtask of 1242-1237-pathfinder-overlay-ts-lint-test)

1. `pnpm test` を実行して全テストを走らせる。
  2. 失敗があれば pathfinder-overlay 関連の失敗を優先的に調査する。
  3. 置換誤りが原因の失敗は、該当箇所を Edit で revert するかインラインリテラルに戻す(修正対象は pathfinder-overlay.ts のみ)。
  4. テストが green になるまで修正と再実行を繰り返す。
  5. 最終的に `pnpm test` の全件が PASS であることをログで確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
