---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1044-1018-639-626-subtask-1-pending-done-git-mv-st
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status 書換 + 単一コミット
---

## Description (subtask of 1044-1018-639-626-subtask-1-pending-done-git-mv-st)

単一アトミック操作として全手順を1コミットで実行。

  実行手順:
  1. Glob `issues/pending/*639-626*subtask*.md` で対象特定
     - 0件かつ issues/done に既存: "already done" で exit 0（成功扱い）
     - 0件かつ done にも無し: 中止報告
     - 2件以上: 中止報告（自動選択禁止）
     - 1件: 手順2へ
  2. Read で対象ファイル frontmatter の現在 status 値を確認・記録
  3. Edit で `status: <現在値>` 行のみを `status: done` に置換
     - replace_all 禁止、frontmatter 他フィールド・本文は不変
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で差分検証
     - 期待パターン: `R  issues/pending/X.md -> issues/done/X.md` + `M  issues/done/X.md` のみ
     - issues/ 配下以外の差分検出時は即中止（hook副作用検出）
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
     - --no-verify 禁止、amend 禁止
  7. 最終検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` で存在確認

  制約 (CLAUDE.md準拠):
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) 触らない
  - issues/ 配下のみ変更
  - lint/test/build 実行不要（issue管理のみ）

  Acceptance criteria:
  - [ ] git log -1 メッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で対象ファイル存在
  - [ ] git status clean
  - [ ] src/tests/config 未変更

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
