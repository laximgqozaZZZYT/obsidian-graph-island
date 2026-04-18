---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 995-973-639-626-subtask-issue-1-pending-done-git
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status:done 書換 + 単一コミット
---

## Description (subtask of 995-973-639-626-subtask-issue-1-pending-done-git)

単一アトミック操作。元issueの手順をそのまま実行。

  実行手順:
  1. Glob `issues/pending/*639-626*subtask*.md` で対象特定
     - 0件かつ `issues/done/*639-626*subtask*.md` 存在: "already done" 報告で exit 0
     - 0件かつ done にも無い: 中止、ユーザー報告
     - 2件以上: 中止、ユーザー報告（自動選択禁止）
     - 1件: 次へ
  2. Read で対象ファイルを開き frontmatter 確認
  3. Edit で `status: in-progress` または `status: pending` の該当1行のみ `status: done` に置換
     - replace_all 禁止、本文/他frontmatter 不変
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で差分検証
     - 期待: R pending→done + M done のみ
     - issues/ 配下以外の差分があれば中止
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 検証:
     - `git status` clean
     - `git log -1 --pretty=%s` がメッセージ一致
     - `ls issues/done/<filename>.md` 存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル（GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts）触らない
  - issues/ 配下のみ変更
  - lint/test/build 不要（issue管理のみのため）
  - `git add -A` 前に `git status` で issues/ 外差分無しを確認

  Acceptance criteria:
  - [ ] git log -1 メッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で対象ファイル存在
  - [ ] git status clean
  - [ ] CLAUDE.md ルール違反なし (src/tests/config 未変更)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
