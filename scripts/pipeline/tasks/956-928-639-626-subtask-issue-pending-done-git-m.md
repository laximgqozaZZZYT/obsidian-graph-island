---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 928-911-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に git mv + status書換 + 単一コミット
---

## Description (subtask of 928-911-639-626-subtask-issue-pending-done-git-m)

1. `Glob issues/pending/*639-626*subtask*.md` で対象を特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` 確認、該当すればno-op (exit 0)
     - 複数件 → 中止してユーザー報告
  2. Read で対象ファイルを開く
  3. Edit で `status: decomposed` または `status: decomposed` のみを `status: done` に置換
     - 他のfrontmatter/Description本文は一切変更しない
  4. `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. `git status` で差分検証:
     - pending削除 / done追加 / status 1行のみであることを確認
     - 他ファイル差分があれば中止
  6. `git add -A && git commit -m "chore: done <filename>"` (拡張子なしベース名)
  7. 検証: `git status` clean / `git log -1 --pretty=%s` 一致 / `ls issues/done/<filename>.md` 存在

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - 対象は issues/ 配下のみ
  - lint / test / build 実行は不要

## Acceptance criteria
- [ ] 対象ファイルが issues/done/ 配下に存在し `status: done` となっていること
- [ ] `git status` clean かつコミット 1 件で完了していること
- [ ] CLAUDE.md のルールに違反しないこと
