---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1018-995-639-626-subtask-1-pending-done-git-mv-st
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status書換 + 単一コミット
---

## Description (subtask of 1018-995-639-626-subtask-1-pending-done-git-mv-st)

単一アトミック操作（分割不可）。以下を1コミットで完結:

  1. Glob `issues/pending/*639-626*subtask*.md`
     - 0件 & done に存在: "already done" 報告で exit 0
     - 0件 & done にも無い: 中止
     - 2件以上: 中止（自動選択禁止）
     - 1件: 次へ
  2. Read で frontmatter 確認
  3. Edit: `status: decomposed` or `status: decomposed` の該当1行のみを `status: done` へ（replace_all 禁止、他行不変）
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` 検証:
     - 期待: R pending→done + M done のみ
     - issues/ 外差分あれば中止
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 検証: `git status` clean / `git log -1 --pretty=%s` 一致 / `ls issues/done/<filename>.md` 存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル触らない
  - issues/ 配下のみ変更
  - lint/test/build 不要

  Acceptance:
  - [ ] git log -1 が `chore: done <basename>` 形式
  - [ ] issues/pending に対象無し
  - [ ] issues/done に status: done で存在
  - [ ] git status clean
  - [ ] CLAUDE.md ルール違反なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
