---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 900-893-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新してコミット
---

## Description (subtask of 900-893-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` を確認 → ヒットなら no-op 成功終了、両方0件ならエラー終了
  3. 複数候補がある場合は frontmatter の summary が「status を done」系の記述を含むものを採用
  4. Read で対象ファイルの frontmatter と本文を確認
  5. 既に `status: done` なら no-op 終了
  6. Edit で `status: in-progress` → `status: done` の1行のみ置換(他フィールド・本文は不変)
  7. lint/test/build は実行しない(frontmatter のみの変更のため)
  8. `git add <path> && git commit -m "chore: done <basename>"` でコミット
  9. ファイル移動は行わない(status更新のみ、pending/ 配下に残す)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
