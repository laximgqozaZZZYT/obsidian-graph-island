---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 730-717-status-done-edit
depends: subtask-2
summary: git status --short で modified マークを確認
---

## Description (subtask of 730-717-status-done-edit)

1. Bash で `git status --short` を実行。
  2. 対象ファイルが `M` (modified) マークで 1 行だけ表示されることを確認。
  3. 他のファイルが `M` / `A` / `D` / `??` で表示されている場合は警告を出力
     (Edit が意図しないファイルに波及した可能性)。
  4. git mv / git add / git commit は実行しない (兄弟タスクへ委譲)。
  5. 出力を次のパイプラインステップに渡す形で終了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
