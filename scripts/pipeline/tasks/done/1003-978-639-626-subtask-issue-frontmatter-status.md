---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 978-970-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新して1コミット作成
---

## Description (subtask of 978-970-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件なら Glob `issues/done/*639-626*subtask*.md` で既完了確認
       - ヒット: no-op 成功終了（コミット作成なし）
       - 両方0件: エラー終了
     - 複数候補の場合、summary に「status を done」系記述を含むものを優先
  2. Read で frontmatter 確認。既に `status: done` なら no-op 終了
  3. Edit で `status: done` → `status: done` を1行のみ置換
     - priority/reported/source/parent/depends/summary と本文は変更禁止
  4. lint/test/build はスキップ（frontmatter のみの変更）
  5. `git add <path>` → `git commit -m "chore: done <basename>"` で1コミット作成
     - <basename> は拡張子付きファイル名
  6. `git mv` pending→done は本タスク範囲外、実施しない

  受け入れ条件:
  - `git diff HEAD~1 -- <path>` で status 1行のみの差分
  - HEAD@{0} に新規コミットが1件のみ
  - God Object (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) 未変更
  - ハードコード/magic number 追加なし、i18n 変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
