---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 883-868-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新してコミット
---

## Description (subtask of 883-868-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件の場合は Glob `issues/done/*639-626*subtask*.md` で確認
     - ヒット = 既に done 済み → no-op 終了（コミットもしない、成功扱い）
     - 両方 0件 → エラー報告して終了
  3. 複数候補の場合は frontmatter `summary` が「subtask issue の status を done に更新しコミット」系のものを採用
  4. Read で対象ファイル全体を取得（frontmatter と本文を確認）
  5. Edit で frontmatter の `status: decomposed` を `status: done` に 1行だけ置換
     - priority / reported / parent / depends / summary / source と本文は一切変更しない
     - 既に `status: done` の場合は no-op 終了
  6. basename を記録（例: `639-626-subtask-xxx.md`）
  7. lint / test / build は **実行しない**（frontmatter変更のみのため不要）
  8. 変更が発生した場合のみ `git add <path> && git commit -m "chore: done <basename>"` でコミット
  9. 変更なし（既に done）の場合はコミットもスキップ
  10. 該当ファイルを `issues/pending/` から `issues/done/` に移動する必要があるかは不明なので、**移動はしない**（status更新のみ）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
