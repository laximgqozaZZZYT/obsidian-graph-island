---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 954-943-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を in-progress → done に置換してコミット
---

## Description (subtask of 954-943-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` で既完了確認 → ヒットすれば no-op 成功終了、両方0件ならエラー終了
  3. 複数候補なら summary に「status を done」系記述を含むものを優先選択
  4. Read で frontmatter 確認。既に `status: done` なら no-op 終了
  5. Edit で `status: in-progress` → `status: done` を1行のみ置換 (他フィールド・本文は不変)
  6. lint/test/build はスキップ (frontmatter のみ変更のため)
  7. `git add <path> && git commit -m "chore: done <basename>"` でコミット1件作成
  8. ファイル移動はしない (pending/ 配下に残す)

  受け入れ条件:
  - `git diff HEAD~1` で status 1行のみの変更
  - コミット1件が作成されている
  - God Object (GraphViewContainer.ts 等) は未変更
  - ハードコード追加なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
