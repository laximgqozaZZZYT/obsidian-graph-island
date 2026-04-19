---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 949-939-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status 書換 + 単一コミット
---

## Description (subtask of 949-939-639-626-subtask-issue-pending-done-git-m)

目的: 639-626 subtask issue 1件を pending から done に移動し、status を done に書き換えて単一コミットする。

  実装手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象を特定
     - 0件かつ `Glob issues/done/*639-626*subtask*.md` に存在: no-op で exit 0、"already done" と報告して終了
     - 0件かつ done にも無い: 中止、ユーザー報告
     - 2件以上: 中止、ユーザー報告
     - 1件: 次ステップへ
  2. Read で対象ファイルを開く
  3. Edit で `status: decomposed` または `status: decomposed` の行のみを `status: done` に置換
     - 他の frontmatter / Description 本文は一切変更しない
     - replace_all は使わず 1行のみ置換
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で差分検証
     - 期待: `R  issues/pending/<file> -> issues/done/<file>` + `M  issues/done/<file>` (または equivalent)
     - 他ファイル差分があれば中止
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` が存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - issues/ 配下のみ変更
  - lint / test / build の実行は不要
  - `git add -A` はリポジトリルートで実行し、issues/ 配下以外の差分が混入しないことを git status で事前確認してから実施

  Acceptance criteria:
  - [ ] git log -1 のメッセージが `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイルが存在しない
  - [ ] issues/done に status: done で対象ファイルが存在する
  - [ ] git status が clean
  - [ ] CLAUDE.md のルールに違反しない (src/tests/configに触れていない)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
