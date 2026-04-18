---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 972-956-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status書換 + 単一コミット
---

## Description (subtask of 972-956-639-626-subtask-issue-pending-done-git-m)

## 手順
  1. `Glob issues/pending/*639-626*subtask*.md` で対象を特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` で移動済み確認。既に done にあれば no-op で exit 0
     - 2件以上 → 中止してユーザーに報告（どれを処理すべきか不明）
     - 1件 → 処理続行
  2. Read で対象ファイルを開き、frontmatter の現在の `status:` 値を確認
  3. Edit で frontmatter 行のみを置換:
     - `status: decomposed` または `status: decomposed` → `status: done`
     - 他フィールド (priority/reported/source/parent/depends/summary) は不変
     - Description 本文は一切変更しない
  4. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行
  5. `git status --short` で差分検証:
     - rename (R) または D+A の該当ファイル 1 組のみ
     - status 行 1 行の変更のみ
     - 他ファイルの差分があれば即中止してユーザー報告
  6. 単一コミット作成（HEREDOC 使用、Co-Authored-By なし）:
     ```
     git add -A && git commit -m "chore: done <filename-without-ext>"
     ```
  7. 最終検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` が存在

  ## 制約（絶対遵守）
  - `src/**`, `tests/**`, `package.json`, `vitest.config.ts`, `esbuild.config.mjs` は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は `issues/` 配下のみ
  - lint / test / build 実行は不要（docs-only 変更）
  - `location.reload()` は使用しない
  - `--no-verify` / `--no-gpg-sign` は使わない

  ## Acceptance criteria
  - [ ] 対象ファイルが `issues/done/` に存在し `issues/pending/` から消えている
  - [ ] status が `done` に書き換わっている
  - [ ] 単一コミットのみ作成されている
  - [ ] `git status` が clean
  - [ ] 他ファイルへの変更ゼロ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
