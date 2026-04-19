---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1072-1056-639-626-subtask-active-1-status-done
depends: subtask-1
summary: 選定ファイルの status を done に置換し差分を検証
---

## Description (subtask of 1072-1056-639-626-subtask-active-1-status-done)

目的: 選定済み1ファイルの frontmatter status を done に置換する。
  手順:
  1. Edit で `status: decomposed` → `status: done` (無ければ `status: decomposed` → `status: done`) を replace_all=false で1件のみ実施。
  2. Bash `git status --short` で変更が当該1ファイルのみであることを確認。
  3. Bash `git diff -- <file>` で差分が frontmatter の status 1行のみであることを確認。
  4. 再 Read で priority / reported / source / parent / depends / summary / Description 本文が一字一句保持されていることを確認。
  禁止:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs への変更
  - God Object 4ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) への変更
  - `git mv` / done/ への移動 / 他フィールド改変
  受け入れ:
  - 選定ファイルの `status:` が `done`
  - `git status --short` 出力が当該1ファイルのみ
  - `git diff` が frontmatter status 1行のみ
  - pnpm test / pnpm lint は非実行で可 (ソース/設定未変更のため)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
