---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1016-994-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に移動し単一コミット
---

## Description (subtask of 1016-994-639-626-subtask-issue-pending-done-git-m)

手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` で確認、既に done なら no-op で exit 0
     - 2件以上 → 中止してユーザーに報告
     - 1件 → 続行
  2. Read で frontmatter の `status:` 値を確認
  3. Edit で frontmatter の status 行のみ `pending` または `in-progress` → `done` に置換
     - 他フィールド (priority/reported/source/parent/depends/summary) 不変
     - Description 本文は一切変更しない
  4. `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. `git status --short` で差分検証:
     - rename (R) または D+A の該当ファイル1組のみ、status 行1行の変更のみ
     - 他ファイル差分があれば中止
  6. 単一コミット (HEREDOC、Co-Authored-By なし):
     `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 最終検証: `git status` clean、`git log -1 --pretty=%s` 一致、`ls issues/done/<filename>.md` 存在

  制約:
  - `src/**`, `tests/**`, `package.json`, `vitest.config.ts`, `esbuild.config.mjs` は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は `issues/` 配下のみ
  - lint/test/build 実行は不要
  - `location.reload()` / `--no-verify` / `--no-gpg-sign` 使用禁止

  Acceptance:
  - [ ] 対象ファイルが `issues/done/` に存在し `issues/pending/` から消えている
  - [ ] status が `done` に書き換わっている
  - [ ] 単一コミットのみ作成されている
  - [ ] `git status` が clean
  - [ ] 他ファイルへの変更ゼロ

---

このissueは既にアトミックな単一操作 (glob → edit status → git mv → 単一 commit) であり、これ以上分解すると各サブタスクが独立コミット不可になるため、1タスクとして維持するのが適切です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
