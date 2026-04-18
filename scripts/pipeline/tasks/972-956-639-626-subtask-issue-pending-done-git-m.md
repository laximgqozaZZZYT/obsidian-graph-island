---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 956-928-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status書換 + 単一コミット
---

## Description (subtask of 956-928-639-626-subtask-issue-pending-done-git-m)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` で確認、既に移動済みならno-op (exit 0)
     - 2件以上 → 中止してユーザーに報告
  2. Read で対象ファイルを開き、現在の status 値を確認
  3. Edit で frontmatter の `status: decomposed` または `status: decomposed` のみを `status: done` に置換
     - 他の frontmatter フィールド (priority/reported/source/parent/depends/summary) は変更しない
     - Description 本文は一切変更しない
  4. Bash で `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行
  5. Bash で `git status --short` を実行し、差分が以下の3つのみであることを検証:
     - `D issues/pending/<filename>.md`
     - `A issues/done/<filename>.md` (または R で rename 検出)
     - status 行 1行のみの変更
     - 他ファイルの差分があれば即中止
  6. Bash で `git add -A && git commit -m "chore: done <filename-without-ext>"` (HEREDOC使用)
  7. 検証: `git status` が clean / `git log -1 --pretty=%s` がコミットメッセージと一致 / `ls issues/done/<filename>.md` が存在

  制約 (絶対遵守):
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は issues/ 配下のみ
  - lint / test / build 実行は不要
  - location.reload() は使用しない (該当なしだが念のため)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
