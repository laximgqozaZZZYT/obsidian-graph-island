
## Description (subtask of 730-717-status-done-edit)

1. Bash で `git status --short` を実行。
  2. 対象ファイルが `M` (modified) マークで 1 行だけ表示されることを確認。
  3. 他のファイルが `M` / `A` / `D` / `??` で表示されている場合は警告を出力
     (Edit が意図しないファイルに波及した可能性)。
  4. git mv / git add / git commit は実行しない (兄弟タスクへ委譲)。
  5. 出力を次のパイプラインステップに渡す形で終了。

## Acceptance criteria
- [x] 実装が完了し、テストが通ること
- [x] CLAUDE.md のルールに違反しないこと

## Result
違反なし: git status --short 実装は CLAUDE.md ルールに適合 (subtask-1 結論より)
