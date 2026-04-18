---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 867-752-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を pending→done に移動して commit
---

## Description (subtask of 867-752-639-626-subtask-issue-status-done-git-mv)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイル1件を特定。
     - 0件なら `Glob issues/done/*639-626*subtask*.md` を確認し、該当すれば no-op で exit 0（コミット不要・正常終了）。
     - 複数件ヒットした場合は中止しユーザー報告。
  2. Read で対象ファイルを開き、Edit で frontmatter の `status: decomposed` 行のみを `status: done` に置換。
     - priority / reported / parent / depends / summary / source / Description 以下本文は一切変更しない。
     - もし `status: decomposed` の場合も同様に `status: done` に変更。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で差分を検証:
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

注: この issue は単一の原子的な git rename + status 書換 + commit で構成されるため、分割すると commit 単位が壊れます。1タスクに集約しました。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
