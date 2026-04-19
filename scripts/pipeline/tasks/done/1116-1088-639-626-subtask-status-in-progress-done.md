---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1088-1068-639-626-subtask-status-in-progress-done
depends: none
summary: 639-626 subtask の status を in-progress→done に置換してコミット
---

## Description (subtask of 1088-1068-639-626-subtask-status-in-progress-done)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定。0件/2件以上なら中断報告
  2. Read で先頭30行確認、`status: cancelled` が1行だけ存在することを検証
     - 既に `status: done` なら no-op で正常終了
     - `status:` 行欠如/他値なら中断報告
  3. Edit (replace_all=false) で `status: cancelled` → `status: done`
  4. `git status --short` で当該1ファイルのみ変更を確認
  5. `git diff -- <file>` で status 行1行のみの差分、他 frontmatter フィールド(priority/reported/source/parent/depends/summary)と Description 本文が完全一致で保持されていることを検証
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

---

`★ Insight ─────────────────────────────────────`
- 元issueの insight が示す通り、Glob→Read→Edit→verify→commit は線形で直前結果に依存するため人工分割は避け、単一 subtask に保持した
- no-op 早期 return (既に done) を含めることで、パイプラインの冪等性・再実行安全性を担保
- 最大5タスク上限は「分割可能なら」の前提なので、原子的タスクは1件出力が正解
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
