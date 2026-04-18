---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 610-595-verify-report
depends: none
summary: 検証データ収集 (行数 / lint / format / test / coverage) を実行して一時 JSON に書き出す
---

## Description (subtask of 610-595-verify-report)

scripts/collect-verify-data.mjs を新規作成。以下を順次実行し結果を `.verify-data.json` に保存:
  - `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で4 God Object の現行行数を取得
  - CLAUDE.md の "Max Allowed" (8597/2216/2702/2321) と比較し、各ファイルの PASS/FAIL と diff を算出
  - `pnpm lint` (exit code のみ) → lint.pass
  - `pnpm format:check` (exit code のみ) → format.pass
  - `pnpm test --reporter=json` を実行し JSON 出力から testsPassed/testsFailed/numTotalTests を抽出
  - `pnpm test:coverage --reporter=json-summary` から total の statements/branches/functions/lines の pct を抽出
  JSON 形式例: `{godObjects:[{file, current, max, diff, pass}], lint:{pass}, format:{pass}, tests:{passed, failed, total}, coverage:{s,b,f,l}}`
  console.* は成果物でないため許容 (scripts/ 配下)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
