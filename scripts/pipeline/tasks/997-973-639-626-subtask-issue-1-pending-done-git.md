---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 973-958-639-626-subtask-issue-1-pending-done-git
depends: none
summary: 639-626 subtask issue 1件を pending→done へ git mv + status書換 + 単一コミット
---

## Description (subtask of 973-958-639-626-subtask-issue-1-pending-done-git)

単一アトミック操作。順序厳守。

  手順:
  1. Glob `issues/pending/*639-626*subtask*.md` で対象特定
     - 0件 かつ `issues/done/*639-626*subtask*.md` 存在: "already done" 報告で exit 0 (冪等)
     - 0件 かつ done にも無い: 中止、ユーザー報告
     - 2件以上: 中止、ユーザー報告 (自動選択禁止)
     - 1件のみ: 次へ進む
  2. Read で対象ファイルを開き frontmatter を確認 (status 行の現在値を把握)
  3. Edit で `status: pending` または `status: pending` の該当1行のみを `status: done` に置換
     - `replace_all: false` 必須 (frontmatter の1行のみ変更)
     - 本文・他frontmatterフィールド不変
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で差分検証
     - 期待パターン: `R  issues/pending/X.md -> issues/done/X.md` + `M  issues/done/X.md` のみ
     - issues/ 配下以外に差分があれば即中止
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 最終検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` が `chore: done <basename>` と一致
     - `ls issues/done/<filename>.md` が存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) 触らない
  - issues/ 配下のみ変更
  - lint/test/build 実行不要
  - `git add -A` 前に必ず `git status` で issues/ 外の差分が無いことを確認

  Acceptance criteria:
  - [ ] git log -1 メッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で対象ファイル存在
  - [ ] git status clean
  - [ ] CLAUDE.md ルール違反なし (src/tests/config 未変更)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
