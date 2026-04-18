---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1018-995-639-626-subtask-1-pending-done-git-mv-st
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status 書換 + 単一コミット
---

## Description (subtask of 1018-995-639-626-subtask-1-pending-done-git-mv-st)

単一アトミック操作。全手順を1コミットで実行。

  実行手順:
  1. Glob "issues/pending/*639-626*subtask*.md" で対象特定
     - 0件かつ done に存在: "already done" で exit 0
     - 0件かつ done にも無い: 中止、ユーザー報告
     - 2件以上: 中止、ユーザー報告（自動選択禁止）
     - 1件: 次へ
  2. Read で frontmatter 確認（status 値を記録）
  3. Edit で `status: in-progress`（または現在値）の該当1行のみ `status: done` に置換
     - replace_all 禁止、本文/他frontmatter 不変
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で検証
     - 期待: `R  issues/pending/X.md -> issues/done/X.md` + `M  issues/done/X.md` のみ
     - issues/ 配下以外の差分があれば中止
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 最終検証:
     - `git status` clean
     - `git log -1 --pretty=%s` がメッセージ一致
     - `ls issues/done/<filename>.md` 存在

  制約 (CLAUDE.md準拠):
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 変更禁止
  - God Object 4ファイル（GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts）触らない
  - issues/ 配下のみ変更
  - lint/test/build 不要（issue管理のみのため）
  - `git add -A` 前に `git status` で issues/ 外差分無しを確認
  - --no-verify 禁止、amend 禁止

  Acceptance criteria:
  - [ ] git log -1 メッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で対象ファイル存在
  - [ ] git status clean
  - [ ] CLAUDE.md ルール違反なし (src/tests/config 未変更)
```

`★ Insight ─────────────────────────────────────`
- `git mv` + `Edit`（status書換）を同一コミットにまとめることで、Obsidian/他ツールから見てもファイル状態が常に整合する
- `git status --short` で `R` (rename) + `M` (modify) のパターン確認は、意図しない副作用（hookによるsrc/tests書換など）を検出する重要なガード
- Glob結果0件/2件以上の分岐は「自動選択禁止」の安全設計 — 曖昧さを人間判断にエスカレーションする
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
