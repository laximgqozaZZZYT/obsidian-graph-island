---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1044-1018-639-626-subtask-1-pending-done-git-mv-st
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status:done 書換 + 単一コミット
---

## Description (subtask of 1044-1018-639-626-subtask-1-pending-done-git-mv-st)

単一アトミック操作。全7手順を1コミットで実行（分割禁止）。

  手順:
  1. Glob `issues/pending/*639-626*subtask*.md`
     - 0件 & done に存在 → "already done" で正常終了
     - 0件 & done にも無い → 中止しユーザー報告
     - 2件以上 → 中止しユーザー報告（自動選択禁止）
     - 1件 → 次へ進む
  2. Read で frontmatter を確認し現 status 値を記録
  3. Edit で `status:` 行1行のみ `status: done` に置換
     - replace_all 禁止、本文/他frontmatter フィールド不変
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で差分検証
     - 期待: `R  issues/pending/X.md -> issues/done/X.md` + `M  issues/done/X.md` のみ
     - issues/ 配下以外の差分があれば即中止（hookによるsrc/tests改変検出）
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 最終検証:
     - `git status` clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` 存在

  制約 (CLAUDE.md準拠):
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル（GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts）触らない
  - issues/ 配下のみ変更
  - lint/test/build 実行不要（issue管理のみ）
  - `git add -A` 前に `git status` で issues/ 外差分無しを必ず確認
  - --no-verify 禁止、amend 禁止、新規コミット作成のみ

  Acceptance criteria:
  - [ ] git log -1 メッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で対象ファイル存在
  - [ ] git status clean
  - [ ] src/, tests/, 設定ファイル未変更

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
