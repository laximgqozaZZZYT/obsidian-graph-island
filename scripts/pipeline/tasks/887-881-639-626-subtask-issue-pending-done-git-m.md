---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 881-867-639-626-subtask-issue-pending-done-commi
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status書換 + commit
---

## Description (subtask of 881-867-639-626-subtask-issue-pending-done-commi)

原子的な rename + frontmatter status 書換 + commit を 1 コミットで実施。

  手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイル1件を特定。
     - 0件 → `Glob issues/done/*639-626*subtask*.md` を確認。該当すれば no-op で exit 0（コミット不要・正常終了）。
     - 複数件 → 中止してユーザー報告。
  2. Read で対象ファイルを開き、Edit で frontmatter の `status: decomposed`（または `status: decomposed`）の 1 行のみを `status: done` に置換。priority / reported / parent / depends / summary / source / Description 以下本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で差分検証:
     - `issues/pending/<filename>.md` 削除
     - `issues/done/<filename>.md` 追加（rename + status 1行変更のみ）
     - 他ファイルに差分があれば即中止してユーザー報告。
  5. `git add -A && git commit -m "chore: done <filename>"`（`<filename>` は拡張子なしベース名）。
  6. 検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` が存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs, esbuild 関連は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) には触らない
  - 対象は issues/ 配下のみ
  - lint / test / build 実行は不要

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
