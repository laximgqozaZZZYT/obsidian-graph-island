---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 752-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv でコミット
---

## Description (subtask of 752-712-639-626-subtask-issue-status-done-git-mv)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイル1件を特定。
     0件なら `Glob issues/done/*639-626*subtask*.md` を確認し、該当すれば no-op で exit 0（コミット不要）。
  2. Read で対象ファイルを開き、Edit で frontmatter の `status: in-progress` を `status: done` に書き換える。
     priority / reported / parent / depends / summary / source / Description 以下本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で差分を検証:
     - `issues/pending/<filename>.md` 削除
     - `issues/done/<filename>.md` 追加（rename + status 1行変更のみ）
     他ファイルに差分があれば即中止。
  5. `git add -A && git commit -m "chore: done <filename>"`（`<filename>` は拡張子なしベース名）。
  6. 検証コマンド:
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
