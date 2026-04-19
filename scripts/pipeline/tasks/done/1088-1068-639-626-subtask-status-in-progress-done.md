---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1068-1042-639-626-subtask-status-in-progress-done
depends: none
summary: 639-626 subtask ファイルの status を in-progress → done に置換してコミット
---

## Description (subtask of 1068-1042-639-626-subtask-status-in-progress-done)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件/2件以上ならエラー報告して中断
  2. Read で先頭30行を確認、frontmatter の `status: decomposed` が1行だけ存在することを検証
     - 既に `status: done` なら no-op で正常終了
     - `status:` 行が無い/他の値なら中断して報告
  3. Edit (replace_all=false) で `status: decomposed` → `status: done`
  4. `git status --short` で当該1ファイルのみ変更されていることを確認
  5. `git diff -- <file>` で status 行1行のみの差分であり、他フィールド(priority/reported/source/parent/depends/summary)と Description 本文が完全一致で保持されていることを検証
  6. コミット: `chore: done 1026-1014-639-626-subtask-status-done`

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object 4ファイル (GraphViewContainer.ts 等) は触らない
  - git mv / リネーム禁止
  - issues/ 配下の当該1ファイルのみ編集

  受け入れ基準:
  - 対象ファイルの status が `done`
  - 他フィールド・本文が完全一致で保持
  - `git diff` が status 行1行のみの差分

`★ Insight ─────────────────────────────────────`
このタスクは既に1セッション (max-turns 30) で完結可能な粒度。Glob→Read→Edit→verify→commit の線形フローで、各ステップが直前の結果に依存するため分割は人工的になる。no-op 検出 (既に `done`) を早期 return にすることで、パイプラインの冪等性・再実行安全性を担保している設計。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
