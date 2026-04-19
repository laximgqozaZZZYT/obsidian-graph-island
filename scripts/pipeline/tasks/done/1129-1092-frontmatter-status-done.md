---
priority: high
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1092-1072-status-done
depends: none
summary: 選定ファイルの frontmatter status を done に置換
---

## Description (subtask of 1092-1072-status-done)

目的: subtask-1 で選定された1ファイルの frontmatter `status` を `done` に置換する。

  手順:
  1. subtask-1 の出力（issues/ 配下の選定済みファイルパス）を Read で取得し、frontmatter 内の `status:` 行を確認。
  2. Edit ツールで以下を `replace_all=false` で1件のみ実施:
     - `status: decomposed` → `status: done`
     - 該当しなければ `status: cancelled` → `status: done`
  3. 編集後、Read で frontmatter 全体を再読込し、`priority` / `reported` / `source` / `parent` / `depends` / `summary` / `Description` 本文が一字一句保持されていることを確認。

  禁止:
  - `src/**`, `tests/**`, `package.json`, `vitest.config.ts`, `esbuild.config.mjs` への一切の変更
  - God Object 4ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) への変更
  - `git mv` / `done/` ディレクトリへの移動
  - `status` 以外のフィールド (priority, summary, depends, source, parent, reported, Description 本文) の改変

  受け入れ:
  - 当該ファイルの frontmatter `status:` 値が `done`
  - 他フィールド・本文は完全に保持されている

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
