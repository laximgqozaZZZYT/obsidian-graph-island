---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 893-883-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新してコミット
---

## Description (subtask of 893-883-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` 確認 → ヒットなら no-op 成功終了、両方0件ならエラー
  3. 複数候補は frontmatter summary が「status を done」系のものを採用
  4. Read で frontmatter と本文確認
  5. Edit で `status: in-progress` → `status: done` のみ1行置換(他フィールドと本文は不変)
  6. 既に done なら no-op 終了
  7. lint/test/build は実行しない
  8. 変更あれば `git add <path> && git commit -m "chore: done <basename>"`
  9. ファイル移動はしない(status更新のみ)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
