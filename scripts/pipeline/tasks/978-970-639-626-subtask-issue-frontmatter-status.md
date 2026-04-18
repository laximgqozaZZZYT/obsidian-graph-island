---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 970-954-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を in-progress → done に置換しコミット
---

## Description (subtask of 970-954-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件の場合 Glob `issues/done/*639-626*subtask*.md` で既完了確認
     - ヒット: no-op 成功終了 (コミット作成なし)
     - 両方0件: エラー終了
  3. 複数候補の場合、summary に「status を done」系の記述を含むものを優先選択
  4. Read で frontmatter を確認し、既に `status: done` なら no-op 終了
  5. Edit で `status: in-progress` → `status: done` を1行のみ置換
     - 他のフィールド (priority/reported/source/parent/depends/summary) と本文は変更禁止
  6. lint/test/build はスキップ (frontmatter のみの変更のため CI 影響なし)
  7. `git add <path>` してから `git commit -m "chore: done <basename>"` で1コミット作成
     - <basename> は拡張子付きファイル名 (例: 639-626-subtask-xxx.md)
  8. pending/ → done/ への `git mv` はしない (本タスクのスコープ外、親タスク側で別途処理)

  受け入れ条件:
  - `git diff HEAD~1 -- <path>` で status 1行のみの差分
  - コミットが1件だけ作成されている (HEAD@{0} のみ新規)
  - God Object (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) 未変更
  - ハードコード追加なし、magic number 追加なし
  - i18n 変更なし
```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
