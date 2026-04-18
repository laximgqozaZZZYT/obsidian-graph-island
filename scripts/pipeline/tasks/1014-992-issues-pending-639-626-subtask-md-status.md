---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 992-971-subtask
depends: none
summary: issues/pending/*639-626*subtask*.md の status を done に置換
---

## Description (subtask of 992-971-subtask)

1. `ls issues/pending/ | grep -E '639-626.*subtask'` で対象ファイル名を1つ特定する (Glob でも可)
  2. Read で該当ファイルのフロントマターを確認
  3. Edit で frontmatter 内の `status: decomposed` または `status: in-progress` の行のみを `status: done` に置換 (replace_all=false、一致が1つのみであることを確認)
  4. `git status` で変更が当該1ファイルのみであることを確認
  5. git mv / ファイル移動は行わない (別 issue で対応)
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) は触らない
  - frontmatter の priority/reported/source/parent/depends/summary と Description 本文は変更禁止
  - issues/ 配下の当該1ファイルのみ編集
  受け入れ基準:
  - 対象ファイルの status が `done` になっている
  - 他フィールド・本文が完全一致で保持されている
  - `pnpm test` / `pnpm lint` は影響を受けない (ソースコード変更なしのため)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
