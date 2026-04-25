
## Description (subtask of 575-565-subtask)

read-only verify: `pnpm test -- GraphViewContainer 2>&1 | tail -50` を実行し、
  GraphViewContainer 関連テストの PASS/FAIL を記録。
  tests/views/ 配下の該当テストファイルを特定しログ出力のみ。
  ファイル変更・コミット禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
