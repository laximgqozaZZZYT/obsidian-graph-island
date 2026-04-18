---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 976-943-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue ファイルを特定し status を done に置換してコミット
---

## Description (subtask of 976-943-639-626-subtask-issue-frontmatter-status)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイル探索
  2. 0件なら `Glob issues/done/*639-626*subtask*.md` を確認
     - ヒット: 既完了として no-op で正常終了 (exit 0, メッセージのみ出力)
     - 両方0件: エラー終了 (exit 1)
  3. 複数候補の場合は summary に「status を done」「status done」「frontmatter status」等を含むものを優先選択
  4. Read で frontmatter を確認
     - 既に `status: done` なら no-op 正常終了（コミットもしない）
     - `status: done` (または他の pending 系) なら次へ
  5. Edit で `status: done` → `status: done` の1行置換のみ実施
     - 他フィールド (priority, reported, source, parent, depends, summary) は不変
     - 本文 (Description, Acceptance criteria) も不変
  6. lint/test/build は実行しない (frontmatter変更のみ)
  7. `git add <path>` でステージング
  8. `git commit -m "chore: done <basename>"` でコミット (basename は拡張子込みファイル名)
  9. ファイル移動 (pending→done) は**行わない**。pending/ 配下に残す

  受け入れ条件:
  - `git diff HEAD~1 -- <path>` 出力が status フィールドのみ1行変更を示す
  - 新規コミットが HEAD に存在する
  - God Object ファイル (GraphViewContainer/PanelBuilder/EdgeRenderer/RenderPipeline) 未変更
  - ハードコード追加なし (該当しない、frontmatterのみ)
  - CLAUDE.md の「Forbidden Patterns」いずれにも抵触しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
