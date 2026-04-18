---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 897-887-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status 書換 + 1 コミット
---

## Description (subtask of 897-887-639-626-subtask-issue-pending-done-git-m)

原子的 rename + frontmatter 1 行書換 + 単一コミットを 1 セッションで完了させる。

  手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象 1 件を特定。
     - 0 件: `Glob issues/done/*639-626*subtask*.md` を確認し、該当すれば no-op で exit 0（既に done 済み、コミット不要）。
     - 複数件: 中止してユーザー報告。
  2. Read で対象ファイルを開き、Edit で frontmatter の `status: decomposed` または `status: decomposed` 行のみを `status: done` に置換。priority / reported / parent / depends / summary / source / Description 本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で差分検証:
     - pending 側削除 / done 側追加（rename + status 1 行のみ）
     - 他ファイルに差分があれば即中止してユーザー報告。
  5. `git add -A && git commit -m "chore: done <filename>"`（拡張子なしベース名）。
  6. 検証: `git status` clean / `git log -1 --pretty=%s` 一致 / `ls issues/done/<filename>.md` 存在。

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は issues/ 配下のみ
  - lint / test / build 実行は不要

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
