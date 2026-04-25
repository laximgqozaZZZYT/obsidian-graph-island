
## Description (subtask of 141-coverage-drop)

`src/layouts/cluster-force.ts` は 1534 stmts/116 fns で 54.6% stmts / 58.6% fns。
  `tests/cluster-force.test.ts` と `tests/cluster-force-blend.test.ts` が既にあるので、
  新ファイル `tests/cluster-force-coverage.test.ts` を追加し既存と重複しないケースを追加。
  対象は export 済み pure 関数（centroid計算/クラスタ割当/blend重み/arrangement変種）。
  `getSymbolsOverview` で公開シンボルを洗い出し、未テストの pure 関数を15件以上カバー。
  god object には触れない（cluster-force.ts 自体の改変は禁止、テストのみ追加）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
