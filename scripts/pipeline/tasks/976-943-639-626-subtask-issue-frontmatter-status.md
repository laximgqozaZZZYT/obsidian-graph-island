---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 943-936-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新してコミット
---

## Description (subtask of 943-936-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` 確認。ヒットすれば既完了として no-op 成功終了。両方0件ならエラー終了
  3. 複数候補なら summary に「status を done」系記述を含むものを優先
  4. Read で frontmatter 確認。既に `status: done` なら no-op 終了
  5. Edit で `status: decomposed` → `status: done` に1行置換のみ (他フィールド・本文は不変)
  6. lint/test/build はスキップ (frontmatterのみ変更)
  7. `git add <path> && git commit -m "chore: done <basename>"` でコミット
  8. ファイル移動は行わない (pending/ 配下に残す)

  受け入れ条件:
  - `git diff HEAD~1` で status フィールドのみ1行変更
  - コミットが作成されている
  - God Object 未変更、ハードコード未追加 (CLAUDE.md 準拠)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
