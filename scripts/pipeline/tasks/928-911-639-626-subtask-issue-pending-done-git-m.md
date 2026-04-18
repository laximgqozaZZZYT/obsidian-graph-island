---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 911-897-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status 書換 + 単一コミット
---

## Description (subtask of 911-897-639-626-subtask-issue-pending-done-git-m)

1 セッション完結の原子的 rename + frontmatter 1 行書換 + 単一コミット。

  手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象 1 件を特定。
     - 0 件なら `Glob issues/done/*639-626*subtask*.md` を確認、該当すれば no-op で exit 0。
     - 複数件なら中止してユーザー報告。
  2. Read で対象ファイルを開き、Edit で `status: in-progress` または `status: pending` 行のみを `status: done` に置換。他の frontmatter / Description 本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md`。
  4. `git status` で差分検証(pending 削除 / done 追加 / status 1 行のみ)。他ファイル差分あれば中止。
  5. `git add -A && git commit -m "chore: done <filename>"`(拡張子なしベース名)。
  6. 検証: `git status` clean / `git log -1 --pretty=%s` 一致 / `ls issues/done/<filename>.md` 存在。

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は issues/ 配下のみ
  - lint / test / build 実行は不要

注: 元 issue 自体が 1 セッション (max-turns 30) で完了する粒度に既に分解済みのため、追加分解は不要と判断し単一 SUBTASK として出力。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
