## Description (subtask of 1654-autonomous-stalled-dirty-skip)

`git diff HEAD -- src/types.ts` および `git status src/types.ts` を実行し、
  ワーキングツリーに残っている未コミット差分の内容を精読して特定する。
  - どの型定義 (interface / type) のどの行が変更されているかを記録
  - `src/types.ts` を import している箇所 (src/parsers, src/views, src/utils, src/layouts 配下) を Grep で洗い出し、
    差分が「正しい型変更を反映済みのコード」と「未反映のコード」のどちらに整合しているか判定
  - 差分が hook / formatter / lint-fix によって自動生成されたものか、人手の編集残骸かを切り分ける
  この調査結果を

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
